import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutService } from '../payouts/payout.service';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private payoutService: PayoutService,
    private analytics: AnalyticsService,
  ) {}

  async getOverview() {
    const analytics = await this.analytics.getAdminDashboard();

    const [pendingKyc, pendingPayoutsList] = await Promise.all([
      this.prisma.kycVerification.count({ where: { status: 'PENDING' } }),
      this.prisma.payout.findMany({
        where: { status: 'PENDING' },
        orderBy: { requestedAt: 'desc' },
        take: 20,
        include: {
          user: { select: { displayName: true, email: true } },
        },
      }),
    ]);

    return {
      ...analytics,
      pendingKycCount: pendingKyc,
      pendingPayoutsList,
    };
  }

  async listPendingKyc() {
    return this.prisma.kycVerification.findMany({
      where: { status: 'PENDING' },
      orderBy: { submittedAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            status: true,
            profile: true,
          },
        },
      },
    });
  }

  async approveKyc(userId: string, adminId: string) {
    const kyc = await this.prisma.kycVerification.findUnique({
      where: { userId },
    });

    if (!kyc) throw new NotFoundException('KYC record not found');
    if (kyc.status !== 'PENDING') {
      throw new BadRequestException('KYC is not pending review');
    }

    const updated = await this.prisma.kycVerification.update({
      where: { userId },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });

    await this.logAction(adminId, 'KYC_APPROVED', userId);
    return updated;
  }

  async rejectKyc(userId: string, adminId: string, reason: string) {
    const kyc = await this.prisma.kycVerification.findUnique({
      where: { userId },
    });

    if (!kyc) throw new NotFoundException('KYC record not found');
    if (kyc.status !== 'PENDING') {
      throw new BadRequestException('KYC is not pending review');
    }

    const updated = await this.prisma.kycVerification.update({
      where: { userId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        rejectionReason: reason.trim(),
      },
    });

    await this.logAction(adminId, 'KYC_REJECTED', userId, { reason });
    return updated;
  }

  async listPendingPayouts() {
    return this.prisma.payout.findMany({
      where: { status: 'PENDING' },
      orderBy: { requestedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            kyc: { select: { status: true } },
          },
        },
      },
    });
  }

  async approvePayout(payoutId: string, adminId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { user: { include: { kyc: true } } },
    });

    if (!payout) throw new NotFoundException('Payout not found');

    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });

    if (config?.requireKycForPayouts !== false) {
      if (payout.user.kyc?.status !== 'APPROVED') {
        throw new BadRequestException(
          'Cannot approve payout — trader KYC is not verified',
        );
      }
    }

    const result = await this.payoutService.approveAndSendPayout(
      payoutId,
      adminId,
    );

    await this.logAction(adminId, 'PAYOUT_APPROVED', payoutId, {
      userId: payout.userId,
      amount: Number(payout.traderShare),
    });

    return result;
  }

  async suspendUser(userId: string, adminId: string, reason: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    await this.logAction(adminId, 'USER_SUSPENDED', userId, { reason });
    return user;
  }

  private async logAction(
    adminId: string,
    action: string,
    targetId?: string,
    metadata?: object,
  ) {
    await this.prisma.auditLog.create({
      data: {
        adminId,
        action,
        targetId,
        metadata: metadata as object | undefined,
      },
    });
  }
}
