import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChainContractEnrollmentStatus,
  KycDocumentType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const CHAIN_CONTRACT_MIN_USD = 2000;
export const CHAIN_CONTRACT_TIER_CUTOFF_USD = 5000;
export const CHAIN_CONTRACT_YIELD_MID = 15;
export const CHAIN_CONTRACT_YIELD_HIGH = 20;
export const CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT = 5;

export function yieldPercentForDeposit(amountUsd: number): number {
  if (amountUsd < CHAIN_CONTRACT_MIN_USD) {
    throw new BadRequestException(
      `Minimum contract deposit is $${CHAIN_CONTRACT_MIN_USD.toLocaleString()} USDT`,
    );
  }
  if (amountUsd <= CHAIN_CONTRACT_TIER_CUTOFF_USD) {
    return CHAIN_CONTRACT_YIELD_MID;
  }
  return CHAIN_CONTRACT_YIELD_HIGH;
}

@Injectable()
export class ChainEnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  async getEnrollment(userId: string) {
    await this.ensureTable();
    const row = await this.prisma.chainContractEnrollment.findUnique({
      where: { userId },
    });
    return this.toDto(
      row ?? {
        id: null,
        userId,
        status: 'NOT_STARTED' as ChainContractEnrollmentStatus,
        termsAcceptedAt: null,
        country: null,
        documentType: null,
        documentNumber: null,
        documentFrontUrl: null,
        documentBackUrl: null,
        livenessSelfieUrl: null,
        livenessPassedAt: null,
        rejectionReason: null,
        kycSubmittedAt: null,
        approvedAt: null,
        activatedAt: null,
        yieldPercent: null,
        withdrawFeePercent: CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT,
      },
    );
  }

  async acceptTerms(userId: string) {
    await this.ensureTable();
    const existing = await this.prisma.chainContractEnrollment.findUnique({
      where: { userId },
    });
    if (
      existing &&
      (existing.status === 'KYC_PENDING' ||
        existing.status === 'APPROVED' ||
        existing.status === 'ACTIVE')
    ) {
      return this.toDto(existing);
    }

    const row = await this.prisma.chainContractEnrollment.upsert({
      where: { userId },
      create: {
        userId,
        status: 'TERMS_ACCEPTED',
        termsAcceptedAt: new Date(),
        withdrawFeePercent: CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT,
      },
      update: {
        status: 'TERMS_ACCEPTED',
        termsAcceptedAt: new Date(),
        rejectionReason: null,
      },
    });
    return this.toDto(row);
  }

  async submitKyc(
    userId: string,
    input: {
      country: string;
      documentType: KycDocumentType;
      documentNumber: string;
      documentFrontUrl: string;
      documentBackUrl?: string;
      livenessSelfieUrl: string;
    },
  ) {
    await this.ensureTable();
    const existing = await this.prisma.chainContractEnrollment.findUnique({
      where: { userId },
    });
    if (!existing?.termsAcceptedAt) {
      throw new BadRequestException('Accept contract terms before KYC');
    }
    if (existing.status === 'KYC_PENDING') {
      throw new BadRequestException('Contract KYC is already under review');
    }
    if (existing.status === 'APPROVED' || existing.status === 'ACTIVE') {
      throw new BadRequestException('Contract KYC is already approved');
    }

    const needsBack =
      input.documentType === 'NATIONAL_ID' ||
      input.documentType === 'DRIVERS_LICENSE';
    if (needsBack && !input.documentBackUrl?.trim()) {
      throw new BadRequestException(
        'Upload the back of your ID / license',
      );
    }
    if (!input.livenessSelfieUrl?.trim()) {
      throw new BadRequestException('Complete liveness verification first');
    }

    // Keep profile country in sync for display / FX.
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, country: input.country.trim() },
      update: { country: input.country.trim() },
    });

    const row = await this.prisma.chainContractEnrollment.update({
      where: { userId },
      data: {
        status: 'KYC_PENDING',
        country: input.country.trim(),
        documentType: input.documentType,
        documentNumber: input.documentNumber.trim(),
        documentFrontUrl: input.documentFrontUrl,
        documentBackUrl: input.documentBackUrl?.trim() || null,
        livenessSelfieUrl: input.livenessSelfieUrl,
        livenessPassedAt: new Date(),
        kycSubmittedAt: new Date(),
        rejectionReason: null,
      },
    });
    return this.toDto(row);
  }

  async markActivated(userId: string, depositUsd: number) {
    await this.ensureTable();
    const existing = await this.prisma.chainContractEnrollment.findUnique({
      where: { userId },
    });
    if (!existing || existing.status !== 'APPROVED') {
      throw new BadRequestException(
        'Contract must be approved before deposit activation',
      );
    }
    const yieldPercent = yieldPercentForDeposit(depositUsd);
    const row = await this.prisma.chainContractEnrollment.update({
      where: { userId },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        yieldPercent,
      },
    });
    return this.toDto(row);
  }

  async approve(userId: string) {
    await this.ensureTable();
    const existing = await this.prisma.chainContractEnrollment.findUnique({
      where: { userId },
    });
    if (!existing || existing.status !== 'KYC_PENDING') {
      throw new BadRequestException('No pending contract KYC to approve');
    }
    const row = await this.prisma.chainContractEnrollment.update({
      where: { userId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });
    return this.toDto(row);
  }

  async reject(userId: string, reason: string) {
    await this.ensureTable();
    const existing = await this.prisma.chainContractEnrollment.findUnique({
      where: { userId },
    });
    if (!existing || existing.status !== 'KYC_PENDING') {
      throw new BadRequestException('No pending contract KYC to reject');
    }
    const row = await this.prisma.chainContractEnrollment.update({
      where: { userId },
      data: {
        status: 'KYC_REJECTED',
        rejectionReason: reason.trim() || 'Rejected',
      },
    });
    return this.toDto(row);
  }

  async listPending(limit = 50) {
    await this.ensureTable();
    const rows = await this.prisma.chainContractEnrollment.findMany({
      where: { status: 'KYC_PENDING' },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { kycSubmittedAt: 'asc' },
      take: Math.min(100, Math.max(1, limit)),
    });
    return rows.map((r) => ({
      ...this.toDto(r),
      email: r.user.email,
      displayName: r.user.displayName,
    }));
  }

  private toDto(row: {
    id: string | null;
    userId: string;
    status: ChainContractEnrollmentStatus;
    termsAcceptedAt: Date | null;
    country: string | null;
    documentType: KycDocumentType | null;
    documentNumber: string | null;
    documentFrontUrl: string | null;
    documentBackUrl: string | null;
    livenessSelfieUrl: string | null;
    livenessPassedAt: Date | null;
    rejectionReason: string | null;
    kycSubmittedAt: Date | null;
    approvedAt: Date | null;
    activatedAt: Date | null;
    yieldPercent: { toString(): string } | number | null;
    withdrawFeePercent: { toString(): string } | number;
  }) {
    const status = row.status;
    const canAccessLiveDashboard = status === 'ACTIVE';
    const showNullDashboard =
      status === 'KYC_PENDING' ||
      status === 'APPROVED' ||
      status === 'KYC_REJECTED';
    const phase =
      status === 'NOT_STARTED'
        ? 1
        : status === 'TERMS_ACCEPTED' || status === 'KYC_REJECTED'
          ? 2
          : 3;

    return {
      id: row.id,
      userId: row.userId,
      status,
      phase,
      termsAcceptedAt: row.termsAcceptedAt?.toISOString() ?? null,
      country: row.country,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      documentFrontUrl: row.documentFrontUrl,
      documentBackUrl: row.documentBackUrl,
      livenessSelfieUrl: row.livenessSelfieUrl,
      livenessPassedAt: row.livenessPassedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      kycSubmittedAt: row.kycSubmittedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      activatedAt: row.activatedAt?.toISOString() ?? null,
      yieldPercent:
        row.yieldPercent != null ? Number(row.yieldPercent) : null,
      withdrawFeePercent: Number(
        row.withdrawFeePercent ?? CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT,
      ),
      canAccessLiveDashboard,
      showNullDashboard,
      canDeposit: status === 'APPROVED',
      terms: {
        minDepositUsd: CHAIN_CONTRACT_MIN_USD,
        midTierMaxUsd: CHAIN_CONTRACT_TIER_CUTOFF_USD,
        midTierYieldPercent: CHAIN_CONTRACT_YIELD_MID,
        highTierYieldPercent: CHAIN_CONTRACT_YIELD_HIGH,
        withdrawFeePercent: CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT,
      },
    };
  }

  private async ensureTable() {
    await this.prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ChainContractEnrollmentStatus" AS ENUM (
          'NOT_STARTED', 'TERMS_ACCEPTED', 'KYC_PENDING', 'KYC_REJECTED', 'APPROVED', 'ACTIVE'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "chain_contract_enrollments" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "status" "ChainContractEnrollmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
        "termsAcceptedAt" TIMESTAMP(3),
        "country" TEXT,
        "documentType" "KycDocumentType",
        "documentNumber" TEXT,
        "documentFrontUrl" TEXT,
        "documentBackUrl" TEXT,
        "livenessSelfieUrl" TEXT,
        "livenessPassedAt" TIMESTAMP(3),
        "rejectionReason" TEXT,
        "kycSubmittedAt" TIMESTAMP(3),
        "approvedAt" TIMESTAMP(3),
        "activatedAt" TIMESTAMP(3),
        "yieldPercent" DECIMAL(5,2),
        "withdrawFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "chain_contract_enrollments_status_idx"
      ON "chain_contract_enrollments"("status")
    `);
  }
}
