import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutService } from '../payouts/payout.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { TpClaimsService } from '../tp-claims/tp-claims.service';
import { PromoService } from '../payments/promo.service';
import { CustodyDepositService } from '../payments/custody-deposit.service';
import { SignalHubService } from '../signals/signal-hub.service';
import { AuthService } from '../auth/auth.service';
import { MessagesService } from '../messages/messages.service';
import { NotificationService } from '../email/notification.service';
import { CreatePromoCodeDto, SendMessageDto } from '../common/dto';
import { assessEmail } from '../common/email-quality.util';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private payoutService: PayoutService,
    private analytics: AnalyticsService,
    private tpClaims: TpClaimsService,
    private promo: PromoService,
    private custodyDeposits: CustodyDepositService,
    private signalHub: SignalHubService,
    private auth: AuthService,
    private messages: MessagesService,
    private notifications: NotificationService,
  ) {}

  async getOverview() {
    const analytics = await this.analytics.getAdminDashboard();

    const [pendingKyc, pendingPayoutsList, pendingTpClaims] = await Promise.all([
      this.prisma.kycVerification.count({ where: { status: 'PENDING' } }),
      this.prisma.payout.findMany({
        where: { status: 'PENDING' },
        orderBy: { requestedAt: 'desc' },
        take: 20,
        include: {
          user: { select: { displayName: true, email: true } },
        },
      }),
      this.tpClaims.listPendingForAdmin(),
    ]);

    return {
      ...analytics,
      pendingKycCount: pendingKyc,
      pendingPayoutsList,
      pendingTpClaimsCount: pendingTpClaims.length,
    };
  }

  listPendingTpClaims() {
    return this.tpClaims.listPendingForAdmin();
  }

  approveTpClaim(claimId: string, adminId: string) {
    return this.tpClaims.approveClaim(claimId, adminId);
  }

  rejectTpClaim(claimId: string, adminId: string, reason: string) {
    return this.tpClaims.rejectClaim(claimId, adminId, reason);
  }

  listPromoCodes() {
    return this.promo.listAll();
  }

  createPromoCode(adminId: string, dto: CreatePromoCodeDto) {
    return this.promo.create(adminId, dto);
  }

  deactivatePromoCode(adminId: string, code: string) {
    return this.promo.deactivate(code, adminId);
  }

  async getHubSenderReport(filters?: {
    days?: number;
    sort?: string;
    min_closed_trades?: number;
    limit?: number;
  }) {
    if (!this.signalHub.isConfigured) {
      throw new ServiceUnavailableException('Signal Hub is not configured');
    }
    const report = await this.signalHub.getSenderReport(filters);
    if (!report) {
      throw new ServiceUnavailableException(
        'Could not fetch sender report from Signal Hub',
      );
    }
    return report;
  }

  listMessageThreads() {
    return this.messages.listAdminThreads();
  }

  getMessageThread(userId: string, since?: string) {
    return this.messages.getAdminThread(userId, since);
  }

  sendMessageToUser(adminId: string, userId: string, dto: SendMessageDto) {
    return this.messages.sendAdminMessage(adminId, userId, dto.body);
  }

  getMessagesUnreadTotal() {
    return this.messages.getAdminUnreadTotal().then((count) => ({ count }));
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
    this.notifications.kycApproved(userId);
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
    this.notifications.kycRejected(userId, reason.trim());
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

  async listUsers(limit = 50, offset = 0, suspiciousOnly = false) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max(offset, 0);

    if (suspiciousOnly) {
      const users = await this.prisma.user.findMany({
        where: {
          role: { not: 'ADMIN' },
          status: { notIn: ['BANNED'] },
          email: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          registrationPaid: true,
          createdAt: true,
          kyc: { select: { status: true } },
          virtualAccount: { select: { tier: true, score: true, totalProfit: true } },
          _count: { select: { signals: true, payouts: true } },
        },
      });

      const flagged = users
        .map((user) => ({
          ...user,
          emailAssessment: assessEmail(user.email),
        }))
        .filter((user) => user.emailAssessment.suspicious);

      const items = flagged.slice(skip, skip + take);

      return {
        items,
        count: flagged.length,
        limit: take,
        offset: skip,
        suspiciousOnly: true,
      };
    }

    const [rows, count] = await Promise.all([
      this.prisma.user.findMany({
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          registrationPaid: true,
          createdAt: true,
          kyc: { select: { status: true } },
          virtualAccount: { select: { tier: true, score: true, totalProfit: true } },
          _count: { select: { signals: true, payouts: true } },
        },
      }),
      this.prisma.user.count(),
    ]);

    const items = rows.map((user) => ({
      ...user,
      emailAssessment: assessEmail(user.email),
    }));

    return { items, count, limit: take, offset: skip, suspiciousOnly: false };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        kyc: true,
        virtualAccount: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        payouts: {
          orderBy: { requestedAt: 'desc' },
          take: 10,
        },
        walletTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 15,
        },
        tpClaims: {
          orderBy: { submittedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            symbol: true,
            direction: true,
            status: true,
            claimType: true,
            submittedAt: true,
            reviewedAt: true,
          },
        },
        _count: {
          select: {
            signals: true,
            payouts: true,
            payments: true,
            tpClaims: true,
            walletTransactions: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const va = user.virtualAccount;

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      walletAddress: user.walletAddress,
      registrationPaid: user.registrationPaid,
      emailVerified: user.emailVerified,
      lastLoginIp: user.lastLoginIp,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      emailAssessment: assessEmail(user.email),
      profile: user.profile
        ? {
            ...user.profile,
            dateOfBirth: user.profile.dateOfBirth?.toISOString() ?? null,
            createdAt: user.profile.createdAt.toISOString(),
            updatedAt: user.profile.updatedAt.toISOString(),
          }
        : null,
      kyc: user.kyc
        ? {
            ...user.kyc,
            submittedAt: user.kyc.submittedAt?.toISOString() ?? null,
            reviewedAt: user.kyc.reviewedAt?.toISOString() ?? null,
            createdAt: user.kyc.createdAt.toISOString(),
            updatedAt: user.kyc.updatedAt.toISOString(),
          }
        : null,
      virtualAccount: va
        ? {
            tier: va.tier,
            balance: Number(va.balance),
            score: va.score,
            weeklyProfit: Number(va.weeklyProfit),
            totalProfit: Number(va.totalProfit),
            winRate: Number(va.winRate),
            totalTrades: va.totalTrades,
            winningTrades: va.winningTrades,
            losingTrades: va.losingTrades,
          }
        : null,
      payments: user.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        currency: p.currency,
        network: p.network,
        status: p.status,
        purpose: p.purpose,
        txHash: p.txHash,
        payAddress: p.payAddress,
        createdAt: p.createdAt.toISOString(),
        confirmedAt: p.confirmedAt?.toISOString() ?? null,
      })),
      payouts: user.payouts.map((p) => ({
        id: p.id,
        status: p.status,
        source: p.source,
        traderShare: Number(p.traderShare),
        payoutMethod: p.payoutMethod,
        walletAddress: p.walletAddress,
        weekNumber: p.weekNumber,
        year: p.year,
        notes: p.notes,
        requestedAt: p.requestedAt.toISOString(),
        processedAt: p.processedAt?.toISOString() ?? null,
      })),
      walletTransactions: user.walletTransactions.map((t) => ({
        id: t.id,
        amount: Number(t.amount),
        type: t.type,
        description: t.description,
        referenceId: t.referenceId,
        createdAt: t.createdAt.toISOString(),
      })),
      tpClaims: user.tpClaims.map((c) => ({
        ...c,
        submittedAt: c.submittedAt.toISOString(),
        reviewedAt: c.reviewedAt?.toISOString() ?? null,
      })),
      counts: user._count,
    };
  }

  async listSignals(limit = 50, offset = 0) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max(offset, 0);

    const [items, count] = await Promise.all([
      this.prisma.signal.findMany({
        take,
        skip,
        orderBy: { submittedAt: 'desc' },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.prisma.signal.count(),
    ]);

    return { items, count, limit: take, offset: skip };
  }

  async listPayouts(status?: string, limit = 50, offset = 0) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max(offset, 0);
    const where = status
      ? { status: status as PayoutStatus }
      : {};

    const [items, count] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        take,
        skip,
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
      }),
      this.prisma.payout.count({ where }),
    ]);

    return { items, count, limit: take, offset: skip };
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

  getNowPaymentsWallet() {
    return this.custodyDeposits.getWalletSummary();
  }

  createCustodyDeposit(adminId: string, amount: number, network: string) {
    return this.custodyDeposits.createDeposit(adminId, amount, network);
  }

  listCustodyDeposits(limit?: number, status?: string, syncPending?: boolean) {
    return this.custodyDeposits.listDeposits(limit, { status, syncPending });
  }

  getCustodyDepositStatus(depositId: string) {
    return this.custodyDeposits.getDepositStatus(depositId);
  }

  syncCustodyDeposit(depositId: string) {
    return this.custodyDeposits.syncDeposit(depositId);
  }

  syncAllCustodyDeposits() {
    return this.custodyDeposits.syncAllPendingDeposits();
  }

  verifyNowPaymentsPayout(payoutId: string, code: string, adminId: string) {
    return this.payoutService.verifyGatewayPayout(payoutId, code, adminId);
  }

  async suspendUser(userId: string, adminId: string, reason: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    await this.logAction(adminId, 'USER_SUSPENDED', userId, { reason });
    return user;
  }

  async banUser(userId: string, adminId: string, reason: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.role === 'ADMIN') {
      throw new BadRequestException('Admin accounts cannot be banned');
    }
    if (existing.status === 'BANNED') {
      throw new BadRequestException('User is already banned');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'BANNED' },
    });

    await this.logAction(adminId, 'USER_BANNED', userId, {
      reason,
      email: existing.email,
      emailAssessment: assessEmail(existing.email),
    });

    return user;
  }

  async banSuspiciousUsers(adminId: string, userIds: string[], reason: string) {
    if (!userIds.length) {
      throw new BadRequestException('Select at least one user to ban');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, role: true, status: true },
    });

    const banned: string[] = [];
    const skipped: { userId: string; reason: string }[] = [];

    for (const userId of userIds) {
      const user = users.find((row) => row.id === userId);
      if (!user) {
        skipped.push({ userId, reason: 'not_found' });
        continue;
      }
      if (user.role === 'ADMIN') {
        skipped.push({ userId, reason: 'admin_account' });
        continue;
      }
      if (user.status === 'BANNED') {
        skipped.push({ userId, reason: 'already_banned' });
        continue;
      }

      const assessment = assessEmail(user.email);
      if (!assessment.suspicious) {
        skipped.push({ userId, reason: 'email_not_flagged' });
        continue;
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: { status: 'BANNED' },
      });
      await this.logAction(adminId, 'USER_BANNED', userId, {
        reason,
        email: user.email,
        emailAssessment: assessment,
        bulk: true,
      });
      banned.push(userId);
    }

    return {
      bannedCount: banned.length,
      bannedUserIds: banned,
      skipped,
      message:
        banned.length > 0
          ? `Banned ${banned.length} account(s) with suspicious emails`
          : 'No accounts were banned',
    };
  }

  async approveRegistrationPayment(userId: string, adminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.registrationPaid) {
      throw new BadRequestException('Registration is already marked as paid');
    }

    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const fee = Number(config?.registrationFeeUsdt ?? 5);

    await this.prisma.payment.create({
      data: {
        userId,
        amount: fee,
        currency: 'USDT',
        network: 'ADMIN',
        purpose: 'registration',
        status: 'CONFIRMED',
        gatewayId: `admin_${adminId}_${Date.now()}`,
        gatewayResponse: { approvedBy: adminId, manual: true } as object,
        confirmedAt: new Date(),
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { registrationPaid: true },
    });

    await this.auth.activateAccount(userId);

    await this.logAction(adminId, 'REGISTRATION_APPROVED', userId, {
      amount: fee,
    });

    this.notifications.accountActivated(userId);

    return {
      userId,
      status: 'ACTIVE',
      registrationPaid: true,
      message: 'Registration approved — account activated',
    };
  }

  async denyRegistrationPayment(
    userId: string,
    adminId: string,
    reason: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.registrationPaid) {
      throw new BadRequestException('Registration is already paid — cannot deny');
    }

    await this.prisma.payment.updateMany({
      where: { userId, purpose: 'registration', status: 'PENDING' },
      data: { status: 'FAILED' },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    await this.logAction(adminId, 'REGISTRATION_DENIED', userId, { reason });

    this.notifications.registrationDenied(userId, reason.trim());

    return {
      userId,
      status: 'SUSPENDED',
      registrationPaid: false,
      message: 'Registration payment denied',
      reason,
    };
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
