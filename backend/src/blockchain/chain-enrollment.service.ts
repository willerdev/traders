import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ChainContractEnrollmentStatus,
  KycDocumentType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KycAiService } from './kyc-ai.service';
import { NotificationService } from '../email/notification.service';

export const CHAIN_CONTRACT_MIN_USD = 2000;
export const CHAIN_CONTRACT_TIER_CUTOFF_USD = 5000;
export const CHAIN_CONTRACT_YIELD_MID = 10;
export const CHAIN_CONTRACT_YIELD_HIGH = 15;
export const CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT = 5;
export const CHAIN_VAULT_LOCK_DAYS = 5;
const CHAIN_VAULT_LOCK_MS = CHAIN_VAULT_LOCK_DAYS * 24 * 60 * 60 * 1000;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly kycAi: KycAiService,
    private readonly notifications: NotificationService,
  ) {}

  async getEnrollment(userId: string) {
    await this.ensureTable();
    const row = await this.prisma.chainContractEnrollment.findUnique({
      where: { userId },
    });
    return this.toDto(
      row ?? {
        id: null,
        userId,
        status: 'NOT_STARTED',
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
      throw new BadRequestException('Upload the back of your ID / license');
    }
    if (!input.livenessSelfieUrl?.trim()) {
      throw new BadRequestException('Complete liveness verification first');
    }

    const numberCheck = await this.kycAi.validateDocumentNumber({
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      country: input.country,
    });
    if (!numberCheck.plausible) {
      throw new BadRequestException(
        numberCheck.reason ||
          'Document number does not look valid. Check and try again.',
      );
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
    await this.transferFromPlatformWallet(userId, depositUsd);
    return this.getEnrollment(userId);
  }

  async getVaultStatus(userId: string) {
    await this.ensureTable();
    const [enrollment, position, wallet, credits] = await Promise.all([
      this.prisma.chainContractEnrollment.findUnique({ where: { userId } }),
      this.prisma.chainVaultPosition.findUnique({ where: { userId } }),
      this.prisma.platformWallet.findUnique({ where: { userId } }),
      this.prisma.chainDailyCredit.findMany({
        where: { userId },
        orderBy: { creditDate: 'desc' },
        take: 30,
      }),
    ]);
    if (!enrollment || !['APPROVED', 'ACTIVE'].includes(enrollment.status)) {
      throw new BadRequestException(
        'Blockchain KYC must be approved before funding',
      );
    }
    const principal = Number(position?.principalBalance ?? 0);
    const profit = Number(position?.profitBalance ?? 0);
    const lockedUntil = position?.lockedUntil ?? null;
    const now = Date.now();
    const unlocked = Boolean(lockedUntil && lockedUntil.getTime() <= now);
    return {
      enrollmentStatus: enrollment.status,
      platformWalletBalance: Number(wallet?.availableBalance ?? 0),
      principalBalance: principal,
      profitBalance: profit,
      totalBalance: Math.round((principal + profit) * 100) / 100,
      yieldPercent: Number(
        position?.yieldPercent ??
          enrollment.yieldPercent ??
          CHAIN_CONTRACT_YIELD_MID,
      ),
      lockDays: CHAIN_VAULT_LOCK_DAYS,
      lockedUntil: lockedUntil?.toISOString() ?? null,
      unlocked,
      secondsUntilUnlock: lockedUntil
        ? Math.max(0, Math.ceil((lockedUntil.getTime() - now) / 1000))
        : 0,
      withdrawFeePercent: Number(
        enrollment.withdrawFeePercent ?? CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT,
      ),
      minimumInitialTransfer: CHAIN_CONTRACT_MIN_USD,
      recentCredits: credits.map((credit) => ({
        id: credit.id,
        amount: Number(credit.amount),
        yieldPercent: Number(credit.yieldPercent),
        baseBalance: Number(credit.baseBalance),
        creditDate: credit.creditDate.toISOString(),
        createdAt: credit.createdAt.toISOString(),
      })),
    };
  }

  async transferFromPlatformWallet(userId: string, rawAmount: number) {
    await this.ensureTable();
    const amount = Math.round(Number(rawAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Transfer amount must be positive');
    }
    await this.prisma.platformWallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const lockUntil = new Date(Date.now() + CHAIN_VAULT_LOCK_MS);
    const reference = `chain_allocate_${randomUUID()}`;
    await this.prisma.$transaction(
      async (tx) => {
        const enrollment = await tx.chainContractEnrollment.findUnique({
          where: { userId },
        });
        if (
          !enrollment ||
          !['APPROVED', 'ACTIVE'].includes(enrollment.status)
        ) {
          throw new BadRequestException(
            'Blockchain KYC must be approved before funding',
          );
        }

        const position = await tx.chainVaultPosition.findUnique({
          where: { userId },
        });
        const currentPrincipal = Number(position?.principalBalance ?? 0);
        const newPrincipal =
          Math.round((currentPrincipal + amount) * 100) / 100;
        if (currentPrincipal <= 0 && newPrincipal < CHAIN_CONTRACT_MIN_USD) {
          throw new BadRequestException(
            `Minimum first blockchain transfer is $${CHAIN_CONTRACT_MIN_USD.toLocaleString()} USDT`,
          );
        }
        const yieldPercent = yieldPercentForDeposit(newPrincipal);

        const wallet = await tx.platformWallet.findUnique({
          where: { userId },
        });
        const currentAvailable = Number(wallet?.availableBalance ?? 0);
        const debited = await tx.platformWallet.updateMany({
          where: { userId, availableBalance: { gte: amount } },
          data: { availableBalance: { decrement: amount } },
        });
        if (debited.count !== 1) {
          throw new BadRequestException('Insufficient platform wallet balance');
        }

        const nextPosition = await tx.chainVaultPosition.upsert({
          where: { userId },
          create: {
            userId,
            principalBalance: amount,
            profitBalance: 0,
            yieldPercent,
            lockedUntil: lockUntil,
          },
          update: {
            principalBalance: { increment: amount },
            yieldPercent,
            lockedUntil: lockUntil,
          },
        });
        await tx.chainContractEnrollment.update({
          where: { userId },
          data: {
            status: 'ACTIVE',
            activatedAt: enrollment.activatedAt ?? new Date(),
            yieldPercent,
          },
        });
        await tx.chainDeposit.create({
          data: {
            userId,
            wallet: `platform-wallet:${userId}`,
            amount,
            hash: reference,
            status: 'SUCCESS',
          },
        });
        await tx.walletTransaction.create({
          data: {
            userId,
            amount: -amount,
            type: 'CHAIN_ALLOCATE',
            referenceId: reference,
            description: `Transferred $${amount.toFixed(2)} USDT to blockchain wallet; principal and profits locked until ${lockUntil.toISOString()}`,
            balanceAfter: currentAvailable - amount,
          },
        });
        await tx.chainNotification.create({
          data: {
            userId,
            type: 'vault_funded',
            title: 'Blockchain wallet funded',
            message: `$${amount.toFixed(2)} USDT transferred from platform wallet. Funds and profits unlock after ${CHAIN_VAULT_LOCK_DAYS} days.`,
            severity: 'success',
          },
        });

        return nextPosition;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.notifications.chainVaultFunded(userId, {
      amount,
      lockedUntil: lockUntil.toISOString(),
    });
    return this.getVaultStatus(userId);
  }

  async withdrawToPlatformWallet(userId: string, rawAmount?: number) {
    await this.ensureTable();
    const reference = `chain_withdraw_${randomUUID()}`;
    let notification:
      | { gross: number; fee: number; net: number; walletBalance: number }
      | undefined;

    await this.prisma.$transaction(
      async (tx) => {
        const enrollment = await tx.chainContractEnrollment.findUnique({
          where: { userId },
        });
        const position = await tx.chainVaultPosition.findUnique({
          where: { userId },
        });
        if (!enrollment || !position) {
          throw new BadRequestException('Blockchain wallet has no funds');
        }
        if (position.lockedUntil.getTime() > Date.now()) {
          throw new BadRequestException(
            `Funds and profits are locked until ${position.lockedUntil.toISOString()}`,
          );
        }

        const principal = Number(position.principalBalance);
        const profit = Number(position.profitBalance);
        const available = Math.round((principal + profit) * 100) / 100;
        const requested =
          rawAmount == null
            ? available
            : Math.round(Number(rawAmount) * 100) / 100;
        if (
          !Number.isFinite(requested) ||
          requested <= 0 ||
          requested > available
        ) {
          throw new BadRequestException(
            `Withdrawal must be between $0.01 and $${available.toFixed(2)} USDT`,
          );
        }

        const profitUsed = Math.min(profit, requested);
        const principalUsed = requested - profitUsed;
        const feePercent = Number(
          enrollment.withdrawFeePercent ?? CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT,
        );
        const fee = Math.round(((requested * feePercent) / 100) * 100) / 100;
        const net = Math.round((requested - fee) * 100) / 100;

        await tx.chainVaultPosition.update({
          where: { userId },
          data: {
            principalBalance:
              Math.round((principal - principalUsed) * 100) / 100,
            profitBalance: Math.round((profit - profitUsed) * 100) / 100,
          },
        });
        const platformWallet = await tx.platformWallet.upsert({
          where: { userId },
          create: { userId, availableBalance: net },
          update: { availableBalance: { increment: net } },
        });
        await tx.chainWithdrawal.create({
          data: {
            userId,
            wallet: `platform-wallet:${userId}`,
            amount: requested,
            hash: reference,
            status: 'SUCCESS',
          },
        });
        await tx.walletTransaction.create({
          data: {
            userId,
            amount: net,
            type: 'CHAIN_WITHDRAW',
            referenceId: reference,
            description: `Blockchain wallet withdrawal $${requested.toFixed(2)} less ${feePercent}% fee ($${fee.toFixed(2)}); $${net.toFixed(2)} credited`,
            balanceAfter: platformWallet.availableBalance,
          },
        });
        await tx.chainNotification.create({
          data: {
            userId,
            type: 'vault_withdrawal',
            title: 'Blockchain withdrawal complete',
            message: `$${net.toFixed(2)} USDT credited to your platform wallet after the $${fee.toFixed(2)} fee.`,
            severity: 'success',
          },
        });
        notification = {
          gross: requested,
          fee,
          net,
          walletBalance: Number(platformWallet.availableBalance),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (notification) {
      this.notifications.chainVaultWithdrawn(userId, notification);
    }
    return this.getVaultStatus(userId);
  }

  async creditDailyVaultProfits() {
    await this.ensureTable();
    const creditDate = this.kampalaToday();
    const positions = await this.prisma.chainVaultPosition.findMany({
      where: { principalBalance: { gt: 0 } },
    });
    let credited = 0;

    for (const position of positions) {
      const principal = Number(position.principalBalance);
      const yieldPercent = Number(position.yieldPercent);
      const amount = Math.round(((principal * yieldPercent) / 100) * 100) / 100;
      if (amount <= 0) continue;
      const reference = `chain_earning_${position.userId}_${creditDate
        .toISOString()
        .slice(0, 10)}`;
      try {
        await this.prisma.$transaction([
          this.prisma.chainDailyCredit.create({
            data: {
              userId: position.userId,
              positionId: position.id,
              amount,
              yieldPercent,
              baseBalance: principal,
              creditDate,
            },
          }),
          this.prisma.chainVaultPosition.update({
            where: { id: position.id },
            data: { profitBalance: { increment: amount } },
          }),
          this.prisma.chainReward.create({
            data: {
              userId: position.userId,
              wallet: `platform-wallet:${position.userId}`,
              amount,
              hash: reference,
              claimed: false,
              status: 'SUCCESS',
            },
          }),
          this.prisma.chainNotification.create({
            data: {
              userId: position.userId,
              type: 'vault_daily_profit',
              title: 'Blockchain daily profit credited',
              message: `$${amount.toFixed(2)} USDT added to locked profit at ${yieldPercent}%.`,
              severity: 'success',
            },
          }),
        ]);
        this.notifications.chainVaultDailyProfit(position.userId, {
          amount,
          yieldPercent,
          principal,
          lockedUntil: position.lockedUntil.toISOString(),
        });
        credited++;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    return { credited, checked: positions.length };
  }

  private kampalaToday(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kampala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
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
    this.notifications.chainContractKycApproved(userId);
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
    this.notifications.chainContractKycRejected(
      userId,
      row.rejectionReason ?? 'Rejected',
    );
    return this.toDto(row);
  }

  /** Wipe enrollment and return to phase 1 (terms). */
  async cancelAndRestart(userId: string) {
    await this.ensureTable();
    const [existing, position] = await Promise.all([
      this.prisma.chainContractEnrollment.findUnique({ where: { userId } }),
      this.prisma.chainVaultPosition.findUnique({ where: { userId } }),
    ]);
    if (!existing || existing.status === 'NOT_STARTED') {
      return this.getEnrollment(userId);
    }
    const vaultBalance =
      Number(position?.principalBalance ?? 0) +
      Number(position?.profitBalance ?? 0);
    if (vaultBalance > 0) {
      throw new BadRequestException(
        'Withdraw blockchain wallet funds before restarting enrollment',
      );
    }

    const row = await this.prisma.chainContractEnrollment.update({
      where: { userId },
      data: {
        status: 'NOT_STARTED',
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

  async listForAdmin(
    input: {
      status?: ChainContractEnrollmentStatus;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    await this.ensureTable();
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const offset = Math.max(0, input.offset ?? 0);
    const where =
      input.status === 'APPROVED'
        ? {
            status: {
              in: ['APPROVED', 'ACTIVE'] as ChainContractEnrollmentStatus[],
            },
          }
        : input.status
          ? { status: input.status }
          : {
              status: {
                in: [
                  'KYC_PENDING',
                  'KYC_REJECTED',
                  'APPROVED',
                  'ACTIVE',
                ] as ChainContractEnrollmentStatus[],
              },
            };
    const [rows, count, grouped] = await Promise.all([
      this.prisma.chainContractEnrollment.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { kycSubmittedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.chainContractEnrollment.count({ where }),
      this.prisma.chainContractEnrollment.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0,
      active: 0,
    };
    for (const group of grouped) {
      if (group.status === 'KYC_PENDING') counts.pending = group._count._all;
      if (group.status === 'APPROVED') counts.approved = group._count._all;
      if (group.status === 'KYC_REJECTED') counts.rejected = group._count._all;
      if (group.status === 'ACTIVE') counts.active = group._count._all;
    }

    return {
      items: rows.map((row) => ({
        ...this.toDto(row),
        email: row.user.email,
        displayName: row.user.displayName,
      })),
      count,
      counts,
    };
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
      yieldPercent: row.yieldPercent != null ? Number(row.yieldPercent) : null,
      withdrawFeePercent: Number(
        row.withdrawFeePercent ?? CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT,
      ),
      canAccessLiveDashboard,
      showNullDashboard,
      canDeposit: status === 'APPROVED',
      canCancelRestart: status !== 'NOT_STARTED',
      terms: {
        minDepositUsd: CHAIN_CONTRACT_MIN_USD,
        midTierMaxUsd: CHAIN_CONTRACT_TIER_CUTOFF_USD,
        midTierYieldPercent: CHAIN_CONTRACT_YIELD_MID,
        highTierYieldPercent: CHAIN_CONTRACT_YIELD_HIGH,
        withdrawFeePercent: CHAIN_CONTRACT_WITHDRAW_FEE_PERCENT,
        yieldDisclaimer:
          'Displayed percentages are indicative starting bands. Actual yield may change based on deposit size, available funds, market conditions, and past user behavior on the platform.',
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
