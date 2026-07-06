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
import { MetaApiService } from '../metaapi/metaapi.service';
import { SignalHubService } from '../signals/signal-hub.service';
import { SignalsService } from '../signals/signals.service';
import { AuthService } from '../auth/auth.service';
import { PaymentsService } from '../payments/payments.service';
import { hasActiveTradingAccess } from '../common/weekly-access.util';
import { MessagesService } from '../messages/messages.service';
import { NotificationService } from '../email/notification.service';
import { ReferralsService } from '../referrals/referrals.service';
import { CreatePromoCodeDto, SendMessageDto, UpdateStaffPermissionsDto } from '../common/dto';
import { assessEmail } from '../common/email-quality.util';
import { resolveAdminPermissions } from './admin-permissions.util';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private payoutService: PayoutService,
    private analytics: AnalyticsService,
    private tpClaims: TpClaimsService,
    private promo: PromoService,
    private custodyDeposits: CustodyDepositService,
    private metaApi: MetaApiService,
    private signalHub: SignalHubService,
    private signals: SignalsService,
    private auth: AuthService,
    private payments: PaymentsService,
    private messages: MessagesService,
    private referrals: ReferralsService,
    private notifications: NotificationService,
  ) {}

  private async getPaymentProjection() {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      totalTraders,
      paidRegistrationCount,
      platformConfig,
      activePremiumPlans,
      activeProPlans,
      renewalsDuePremium,
      renewalsDuePro,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
      this.prisma.user.count({
        where: { role: { not: 'ADMIN' }, registrationPaid: true },
      }),
      this.prisma.platformConfig.findUnique({ where: { id: 'default' } }),
      this.prisma.subscription.count({
        where: {
          isActive: true,
          plan: 'PREMIUM',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      this.prisma.subscription.count({
        where: {
          isActive: true,
          plan: 'PRO',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      this.prisma.subscription.count({
        where: {
          isActive: true,
          plan: 'PREMIUM',
          expiresAt: { gt: now, lte: in30Days },
        },
      }),
      this.prisma.subscription.count({
        where: {
          isActive: true,
          plan: 'PRO',
          expiresAt: { gt: now, lte: in30Days },
        },
      }),
    ]);

    const registrationFeeUsdt = Number(platformConfig?.registrationFeeUsdt ?? 5);
    const unpaidRegistrationCount = Math.max(totalTraders - paidRegistrationCount, 0);
    const projectedRegistrationRevenueUsdt =
      unpaidRegistrationCount * registrationFeeUsdt;
    const projectedNextSetupRenewalRevenueUsdt =
      activePremiumPlans * 5 + activeProPlans * 15;
    const setupRenewalsDue30dAmountUsdt =
      renewalsDuePremium * 5 + renewalsDuePro * 15;

    return {
      totalTraders,
      paidRegistrationCount,
      unpaidRegistrationCount,
      registrationFeeUsdt,
      projectedRegistrationRevenueUsdt,
      activeSetupPlans: {
        premium: activePremiumPlans,
        pro: activeProPlans,
      },
      setupRenewalsDue30d: {
        premium: renewalsDuePremium,
        pro: renewalsDuePro,
        total: renewalsDuePremium + renewalsDuePro,
        amountUsdt: setupRenewalsDue30dAmountUsdt,
      },
      projectedNextSetupRenewalRevenueUsdt,
      projectedCombinedNextRevenueUsdt:
        projectedRegistrationRevenueUsdt + projectedNextSetupRenewalRevenueUsdt,
    };
  }

  async getOverview() {
    const analytics = await this.analytics.getAdminDashboard();

    const [pendingKyc, pendingPayoutsList, pendingTpClaims, pendingOpenSetups, paymentProjection] =
      await Promise.all([
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
        this.prisma.signal.count({ where: { status: 'OPEN' } }),
        this.getPaymentProjection(),
      ]);

    return {
      ...analytics,
      pendingKycCount: pendingKyc,
      pendingPayoutsList,
      pendingTpClaimsCount: pendingTpClaims.length,
      pendingOpenSetupsCount: pendingOpenSetups,
      paymentProjection,
    };
  }

  async getPaymentForecast() {
    const now = new Date();
    const projection = await this.getPaymentProjection();

    const [
      confirmedPayments,
      paidUsers,
      unpaidUsers,
      setupSubscribers,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'CONFIRMED' },
        select: { purpose: true, amount: true },
      }),
      this.prisma.user.findMany({
        where: { role: { not: 'ADMIN' }, registrationPaid: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          displayName: true,
          email: true,
          status: true,
          createdAt: true,
          payments: {
            where: { purpose: 'registration', status: 'CONFIRMED' },
            orderBy: { confirmedAt: 'desc' },
            take: 1,
            select: {
              amount: true,
              confirmedAt: true,
              network: true,
            },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { role: { not: 'ADMIN' }, registrationPaid: false },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          displayName: true,
          email: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.subscription.findMany({
        where: {
          isActive: true,
          plan: { in: ['PREMIUM', 'PRO'] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { expiresAt: 'asc' },
        take: 100,
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      }),
    ]);

    const revenueByPurpose: Record<string, { count: number; totalUsdt: number }> =
      {};
    for (const payment of confirmedPayments) {
      const key = payment.purpose || 'other';
      const bucket = revenueByPurpose[key] ?? { count: 0, totalUsdt: 0 };
      bucket.count += 1;
      bucket.totalUsdt += Number(payment.amount);
      revenueByPurpose[key] = bucket;
    }

    const setupRenewalBase = projection.projectedNextSetupRenewalRevenueUsdt;
    const scenarios = [25, 50, 75, 100].map((conversionPercent) => {
      const unpaidConverting = Math.round(
        (projection.unpaidRegistrationCount * conversionPercent) / 100,
      );
      const registrationRevenueUsdt =
        unpaidConverting * projection.registrationFeeUsdt;
      return {
        conversionPercent,
        unpaidConverting,
        registrationRevenueUsdt,
        setupRenewalRevenueUsdt: setupRenewalBase,
        totalRevenueUsdt: registrationRevenueUsdt + setupRenewalBase,
      };
    });

    const setupPlanPrice: Record<string, number> = {
      PREMIUM: 5,
      PRO: 15,
    };

    return {
      projection,
      scenarios,
      revenueCollected: {
        totalUsdt: confirmedPayments.reduce(
          (sum, p) => sum + Number(p.amount),
          0,
        ),
        byPurpose: revenueByPurpose,
      },
      paidUsers: paidUsers.map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        joinedAt: user.createdAt.toISOString(),
        registrationPayment: user.payments[0]
          ? {
              amount: Number(user.payments[0].amount),
              confirmedAt:
                user.payments[0].confirmedAt?.toISOString() ?? null,
              network: user.payments[0].network,
            }
          : null,
      })),
      unpaidUsers: unpaidUsers.map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        joinedAt: user.createdAt.toISOString(),
        owedUsdt: projection.registrationFeeUsdt,
      })),
      setupPlanSubscribers: setupSubscribers.map((sub) => ({
        userId: sub.userId,
        displayName: sub.user.displayName,
        email: sub.user.email,
        plan: sub.plan,
        renewsAt: sub.expiresAt?.toISOString() ?? null,
        renewalAmountUsdt: setupPlanPrice[sub.plan] ?? 0,
      })),
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
      return {
        days: filters?.days ?? 90,
        total_senders: 0,
        returned: 0,
        senders: [],
      };
    }
    const report = await this.signalHub.getSenderReport(filters);
    if (!report) {
      return {
        days: filters?.days ?? 90,
        total_senders: 0,
        returned: 0,
        senders: [],
      };
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
    const rows = await this.prisma.kycVerification.findMany({
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

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      status: row.status,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      documentFrontUrl: row.documentFrontUrl,
      documentBackUrl: row.documentBackUrl,
      selfieUrl: row.selfieUrl,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      user: row.user,
    }));
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
    await this.referrals.rewardForKyc(userId).catch(() => undefined);
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

  getWeeklyTierPayoutSettings() {
    return this.payoutService.isWeeklyTierPayoutsEnabled().then(
      (weeklyTierPayoutsEnabled) => ({ weeklyTierPayoutsEnabled }),
    );
  }

  setWeeklyTierPayoutsEnabled(enabled: boolean) {
    return this.payoutService.setWeeklyTierPayoutsEnabled(enabled);
  }

  async getAdminSession(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        adminCanApproveKyc: true,
        adminCanApprovePayouts: true,
        adminCanApproveTpClaims: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      permissions: resolveAdminPermissions(user),
    };
  }

  async updateStaffPermissions(
    userId: string,
    dto: UpdateStaffPermissionsDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        displayName: true,
        email: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === 'ADMIN') {
      throw new BadRequestException(
        'Admin accounts already have full access — assign permissions to non-admin users',
      );
    }

    const data: {
      adminCanApproveKyc?: boolean;
      adminCanApprovePayouts?: boolean;
      adminCanApproveTpClaims?: boolean;
    } = {};
    if (dto.canApproveKyc !== undefined) {
      data.adminCanApproveKyc = dto.canApproveKyc;
    }
    if (dto.canApprovePayouts !== undefined) {
      data.adminCanApprovePayouts = dto.canApprovePayouts;
    }
    if (dto.canApproveTpClaims !== undefined) {
      data.adminCanApproveTpClaims = dto.canApproveTpClaims;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        adminCanApproveKyc: true,
        adminCanApprovePayouts: true,
        adminCanApproveTpClaims: true,
      },
    });

    return {
      ...updated,
      permissions: resolveAdminPermissions(updated),
    };
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
          adminCanApproveKyc: true,
          adminCanApprovePayouts: true,
          adminCanApproveTpClaims: true,
          registrationPaid: true,
          accessExpiresAt: true,
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
          adminCanApproveKyc: true,
          adminCanApprovePayouts: true,
          adminCanApproveTpClaims: true,
          registrationPaid: true,
          accessExpiresAt: true,
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
      accessExpiresAt: user.accessExpiresAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
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
      adminCanApproveKyc: user.adminCanApproveKyc,
      adminCanApprovePayouts: user.adminCanApprovePayouts,
      adminCanApproveTpClaims: user.adminCanApproveTpClaims,
      walletAddress: user.walletAddress,
      registrationPaid: user.registrationPaid,
      accessExpiresAt: user.accessExpiresAt?.toISOString() ?? null,
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

  async listSignals(limit = 50, offset = 0, status?: string) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max(offset, 0);
    const where = status?.trim() ? { status: status.trim() as never } : {};

    const [items, count] = await Promise.all([
      this.prisma.signal.findMany({
        where,
        take,
        skip,
        orderBy: { submittedAt: 'desc' },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
          trade: {
            select: {
              activatedAt: true,
              closedAt: true,
              isWin: true,
            },
          },
        },
      }),
      this.prisma.signal.count({ where }),
    ]);

    return {
      items: items.map((signal) => ({
        ...signal,
        entryMin: signal.entryMin.toString(),
        entryMax: signal.entryMax.toString(),
        stopLoss: signal.stopLoss.toString(),
        takeProfit: signal.takeProfit.toString(),
        riskRewardRatio: signal.riskRewardRatio.toString(),
        hubQueued: Boolean(signal.hubRecordId),
        metaApiQueued: Boolean(
          signal.metaApiOrderId || signal.metaApiExecutedAt,
        ),
        tp1ClaimNoticeApprovedAt:
          signal.tp1ClaimNoticeApprovedAt?.toISOString() ?? null,
      })),
      count,
      limit: take,
      offset: skip,
      status: status?.trim() || null,
    };
  }

  setSetupLimit(signalId: string) {
    return this.signals.adminSetSetupLimit(signalId);
  }

  mirrorSetupToCopy(signalId: string) {
    return this.signals.adminMirrorSetupToCopy(signalId);
  }

  async approveTp1ClaimEmail(signalId: string, adminId: string) {
    const signal = await this.prisma.signal.findUnique({
      where: { signalId },
      select: { id: true, signalId: true, tp1ClaimNoticeApprovedAt: true },
    });
    if (!signal) throw new NotFoundException('Signal not found');

    if (!signal.tp1ClaimNoticeApprovedAt) {
      await this.prisma.signal.update({
        where: { id: signal.id },
        data: { tp1ClaimNoticeApprovedAt: new Date() },
      });
    }

    await this.logAction(adminId, 'TP1_CLAIM_EMAIL_APPROVED', signalId, {});
    return {
      ok: true,
      signalId: signal.signalId,
      approvedAt: new Date().toISOString(),
      message:
        'TP1 claim availability email approved. Trader will be notified on the next sync cycle if TP1 is reached.',
    };
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

  listMetaApiAccounts(query?: {
    limit?: number;
    offset?: number;
    search?: string;
    deploymentStatus?: string;
  }) {
    return this.metaApi.listAccounts({
      limit: query?.limit,
      offset: query?.offset,
      query: query?.search,
      deploymentStatus: query?.deploymentStatus,
    });
  }

  getMetaApiAccount(accountId: string) {
    return this.metaApi.getAccount(accountId);
  }

  getCopyTradingDashboard(includeTerminal = true) {
    return this.signals.getCopyTradingDashboard(includeTerminal);
  }

  getMetaApiTerminal(accountId?: string) {
    const resolved =
      accountId?.trim() ||
      this.metaApi.getConfiguredDefaultAccountId() ||
      null;

    if (!this.metaApi.isConfigured) {
      return {
        configured: false,
        defaultAccountId: null,
        accountId: null,
        account: null,
        information: null,
        positions: [],
        error: 'METAAPI_TOKEN is not configured',
      };
    }

    if (!resolved) {
      return {
        configured: true,
        defaultAccountId: this.metaApi.getConfiguredDefaultAccountId(),
        accountId: null,
        account: null,
        information: null,
        positions: [],
        error:
          'No MetaAPI account selected — set METAAPI_DEFAULT_ACCOUNT_ID or pick an account',
      };
    }

    return this.metaApi.getTerminalState(resolved);
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
    if (hasActiveTradingAccess(user)) {
      throw new BadRequestException('Weekly trading access is already active');
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

    const accessExpiresAt = await this.payments.grantWeeklyAccess(userId);
    await this.auth.activateAccount(userId);

    await this.logAction(adminId, 'REGISTRATION_APPROVED', userId, {
      amount: fee,
    });

    this.notifications.accountActivated(userId);

    return {
      userId,
      status: 'ACTIVE',
      registrationPaid: true,
      accessExpiresAt: accessExpiresAt.toISOString(),
      message: 'Weekly access approved — 7 trading days activated',
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
