import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DepositorPlanStatus, MomoP2pStatus, WalletTxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NowPaymentsApiError,
  NowPaymentsService,
} from '../payments/nowpayments.service';
import {
  isPublicHttpsUrl,
  resolvePublicApiBaseUrl,
} from '../common/public-url.util';
import { NotificationService } from '../email/notification.service';
import { ComplianceService } from '../compliance/compliance.service';
import { PaymentsService } from '../payments/payments.service';
import { WALLET_WITHDRAWAL_FEE_USD } from '../common/constants';
import {
  normalizePreferredSchedule,
  quoteWithdrawalFees,
} from './withdrawal-schedule';
import { SavedWithdrawalWalletService } from './saved-withdrawal-wallet.service';
import {
  isMomoWithdrawalNetwork,
} from '../flutterwave/flutterwave.constants';
import { FlutterwavePaymentsService } from '../flutterwave/flutterwave-payments.service';
import { FxRatesService } from '../fx/fx-rates.service';
import { BinanceC2cService } from '../fx/binance-c2c.service';
import { resolvePreferredDisplayCurrency } from '../fx/country-currency.util';
import { isInvestorVipActive } from '../investor/investor-vip.util';
import { PayoutService } from '../payouts/payout.service';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';

const PLAN_DAYS = 5;
const DEPOSIT_MIN_FALLBACK_USDT = 10;
const WITHDRAW_OTP_TTL_MS = 10 * 60 * 1000;
const WITHDRAW_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const WITHDRAW_OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private nowPayments: NowPaymentsService,
    private config: ConfigService,
    private notifications: NotificationService,
    private compliance: ComplianceService,
    private savedWithdrawalWallets: SavedWithdrawalWalletService,
    @Inject(forwardRef(() => PaymentsService))
    private payments: PaymentsService,
    @Inject(forwardRef(() => FlutterwavePaymentsService))
    private flutterwavePayments: FlutterwavePaymentsService,
    private fxRates: FxRatesService,
    private binanceC2c: BinanceC2cService,
    @Inject(forwardRef(() => PayoutService))
    private payouts: PayoutService,
  ) {}

  quoteMomoP2p(amountUsdt: number) {
    return this.binanceC2c.quoteUsdtToUgx(amountUsdt);
  }

  private serializeMomoP2p(row: {
    id: string;
    payoutId: string;
    amountUsdt: { toString(): string } | number;
    amountUgx: { toString(): string } | number;
    rateUgxPerUsdt: { toString(): string } | number;
    momoNetwork: string;
    momoPhone: string;
    momoLabel: string | null;
    recipientName: string | null;
    status: MomoP2pStatus;
    opsEmailSentAt: Date | null;
    userConfirmedAt: Date | null;
    adminConfirmedAt: Date | null;
    agentId?: string | null;
    agentClaimedAt?: Date | null;
    agentConfirmedAt?: Date | null;
    agentProofUrl?: string | null;
    completedAt: Date | null;
    completedBy: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      payoutId: row.payoutId,
      amountUsdt: Number(row.amountUsdt),
      amountUgx: Number(row.amountUgx),
      rateUgxPerUsdt: Number(row.rateUgxPerUsdt),
      momoNetwork: row.momoNetwork,
      momoPhone: row.momoPhone,
      momoLabel: row.momoLabel,
      recipientName: row.recipientName,
      status: row.status,
      opsEmailSentAt: row.opsEmailSentAt?.toISOString() ?? null,
      userConfirmedAt: row.userConfirmedAt?.toISOString() ?? null,
      adminConfirmedAt: row.adminConfirmedAt?.toISOString() ?? null,
      agentId: row.agentId ?? null,
      agentClaimedAt: row.agentClaimedAt?.toISOString() ?? null,
      agentConfirmedAt: row.agentConfirmedAt?.toISOString() ?? null,
      agentProofUrl: row.agentProofUrl ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      completedBy: row.completedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listMomoP2pForUser(userId: string) {
    const rows = await this.prisma.momoP2pWithdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => this.serializeMomoP2p(r));
  }

  async getMomoP2pForUser(userId: string, id: string) {
    const row = await this.prisma.momoP2pWithdrawal.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('MoMo P2P withdrawal not found');
    return this.serializeMomoP2p(row);
  }

  async confirmMomoP2pReceived(userId: string, id: string) {
    return this.completeMomoP2p(id, 'USER', userId);
  }

  async confirmMomoP2pSentByAdmin(adminId: string, id: string) {
    return this.completeMomoP2p(id, 'ADMIN', undefined, adminId);
  }

  /** Re-send MoMo P2P “send money” email to ops + ACTIVE cash agents. */
  async resendMomoP2pOpsEmail(id: string) {
    const row = await this.prisma.momoP2pWithdrawal.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException('MoMo P2P withdrawal not found');
    if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
      throw new BadRequestException(
        'This MoMo P2P withdrawal is already closed',
      );
    }

    const emailSent = await this.notifications.notifyMomoP2pOps({
      userId: row.userId,
      userName: row.recipientName || row.user.displayName,
      userEmail: row.user.email ?? null,
      payoutId: row.payoutId,
      p2pId: row.id,
      amountUsdt: Number(row.amountUsdt),
      amountUgx: Number(row.amountUgx),
      rateUgxPerUsdt: Number(row.rateUgxPerUsdt),
      momoPhone: row.momoPhone,
      momoNetwork: row.momoNetwork,
      momoLabel: row.momoLabel,
    });

    const updated = await this.prisma.momoP2pWithdrawal.update({
      where: { id: row.id },
      data: { opsEmailSentAt: new Date() },
    });

    return {
      ok: emailSent,
      p2p: this.serializeMomoP2p(updated),
      message: emailSent
        ? 'MoMo P2P email re-sent to ops and active cash agents'
        : 'Email send failed — check Resend config',
    };
  }

  async listMomoP2pForAgent(agentId: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.momoP2pWithdrawal.findMany({
      where: {
        status: { in: ['INITIATED', 'UNDER_PROCESS'] },
        OR: [{ agentId: null }, { agentId }],
      },
      orderBy: { createdAt: 'asc' },
      take,
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });
    return rows.map((r) => ({
      ...this.serializeMomoP2p(r),
      mine: r.agentId === agentId,
      recipientName: r.recipientName || r.user.displayName,
    }));
  }

  async claimMomoP2pForAgent(agentId: string, id: string) {
    const row = await this.prisma.momoP2pWithdrawal.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('MoMo P2P withdrawal not found');
    if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
      throw new BadRequestException('This withdrawal is no longer open');
    }
    if (row.agentId && row.agentId !== agentId) {
      throw new BadRequestException('Another agent already claimed this payout');
    }
    const updated = await this.prisma.momoP2pWithdrawal.update({
      where: { id },
      data: {
        agentId,
        agentClaimedAt: row.agentClaimedAt ?? new Date(),
        status: row.status === 'INITIATED' ? 'UNDER_PROCESS' : row.status,
      },
    });
    return this.serializeMomoP2p(updated);
  }

  async confirmMomoP2pSentByAgent(
    agentId: string,
    id: string,
    proofUrl: string,
  ) {
    return this.completeMomoP2p(id, 'AGENT', undefined, undefined, agentId, proofUrl);
  }

  async listMomoP2pAdmin(status?: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const where =
      status && status !== 'ALL'
        ? { status: status as MomoP2pStatus }
        : { status: { in: ['INITIATED', 'UNDER_PROCESS'] as MomoP2pStatus[] } };
    const rows = await this.prisma.momoP2pWithdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    return rows.map((r) => ({
      ...this.serializeMomoP2p(r),
      user: r.user,
    }));
  }

  private async completeMomoP2p(
    id: string,
    by: 'USER' | 'ADMIN' | 'AGENT',
    userId?: string,
    adminId?: string,
    agentId?: string,
    proofUrl?: string,
  ) {
    const row = await this.prisma.momoP2pWithdrawal.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('MoMo P2P withdrawal not found');
    if (by === 'USER' && row.userId !== userId) {
      throw new NotFoundException('MoMo P2P withdrawal not found');
    }
    if (by === 'AGENT') {
      if (!agentId) {
        throw new BadRequestException('Agent id required');
      }
      if (row.agentId && row.agentId !== agentId) {
        throw new BadRequestException('This payout is claimed by another agent');
      }
      if (!proofUrl?.trim()) {
        throw new BadRequestException(
          'Screenshot proof is required to confirm agent send',
        );
      }
    }
    if (row.status === 'COMPLETED') {
      return this.serializeMomoP2p(row);
    }
    if (row.status === 'CANCELLED') {
      throw new BadRequestException('This MoMo P2P withdrawal was cancelled');
    }

    const now = new Date();
    const confirmNote =
      by === 'USER'
        ? 'User confirmed MoMo arrival'
        : by === 'ADMIN'
          ? `Admin ${adminId ?? ''} confirmed MoMo sent`
          : `Agent ${agentId ?? ''} confirmed MoMo sent with proof`;

    const updated = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({
        where: { id: row.payoutId },
        select: { notes: true },
      });
      const p2p = await tx.momoP2pWithdrawal.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          completedBy: by,
          userConfirmedAt: by === 'USER' ? now : row.userConfirmedAt,
          adminConfirmedAt: by === 'ADMIN' ? now : row.adminConfirmedAt,
          agentId: by === 'AGENT' ? agentId : row.agentId,
          agentClaimedAt:
            by === 'AGENT'
              ? row.agentClaimedAt ?? now
              : row.agentClaimedAt,
          agentConfirmedAt: by === 'AGENT' ? now : row.agentConfirmedAt,
          agentProofUrl:
            by === 'AGENT' ? proofUrl!.trim() : row.agentProofUrl,
        },
      });
      await tx.payout.update({
        where: { id: row.payoutId },
        data: {
          status: 'PAID',
          processedAt: now,
          notes: `${payout?.notes ?? ''} — ${confirmNote}`.trim(),
        },
      });
      return p2p;
    });

    this.notifications.momoP2pCompleted(row.userId, {
      amountUsdt: Number(row.amountUsdt),
      amountUgx: Number(row.amountUgx),
      momoPhone: row.momoPhone,
      completedBy: by,
      p2pId: row.id,
    });

    return this.serializeMomoP2p(updated);
  }

  private ipnUrl() {
    const base = resolvePublicApiBaseUrl(this.config);
    const url = `${base}/api/v1/payments/ipn`;
    if (process.env.NODE_ENV === 'production' && !isPublicHttpsUrl(url)) {
      return undefined;
    }
    return url;
  }

  async getOrCreateWallet(userId: string) {
    return this.prisma.platformWallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async getPlatformConfig() {
    return this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
  }

  previewPlan(amount: number, riskPercent: number) {
    const maxLossPerDay = (amount * riskPercent) / 100;
    const maxGainPerDay = maxLossPerDay * 2;
    const days = Array.from({ length: PLAN_DAYS }, (_, i) => ({
      day: i + 1,
      maxLoss: maxLossPerDay,
      maxGain: maxGainPerDay,
    }));
    return {
      amount,
      riskPercent,
      maxLossPerDay,
      maxGainPerDay,
      rr: '1:2',
      days,
      planDays: PLAN_DAYS,
    };
  }

  async previewDepositPlan(amount: number, riskPercent: number) {
    const config = await this.getPlatformConfig();
    const minDeposit = Number(config?.depositorMinDepositUsdt ?? 50);
    const dailyYieldPercent = Number(config?.depositorDailyYieldPercent ?? 0.5);

    if (amount < minDeposit) {
      throw new BadRequestException(`Minimum deposit is $${minDeposit} USDT`);
    }
    if (riskPercent < 0.5 || riskPercent > 10) {
      throw new BadRequestException('Risk must be between 0.5% and 10%');
    }

    const base = this.previewPlan(amount, riskPercent);
    const projectedDailyEarning = (amount * dailyYieldPercent) / 100;
    const projectedTotalEarning = projectedDailyEarning * PLAN_DAYS;

    return {
      ...base,
      dailyYieldPercent,
      projectedDailyEarning,
      projectedTotalEarning,
      days: base.days.map((d) => ({
        ...d,
        projectedEarning: projectedDailyEarning,
      })),
    };
  }

  async getSummary(userId: string) {
    try {
      await this.payments.syncUserPendingWalletDeposits(userId);
    } catch (err) {
      this.logger.warn(
        `Wallet deposit sync failed for ${userId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    const [wallet, txs, payments, activePlan, pendingDeposits] =
      await Promise.all([
      this.getOrCreateWallet(userId),
      this.prisma.walletTransaction.findMany({ where: { userId } }),
      this.prisma.payment.findMany({
        where: { userId, status: 'CONFIRMED' },
      }),
      this.prisma.depositorPlan.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: { credits: { orderBy: { dayIndex: 'asc' } } },
      }),
      this.prisma.payment.findMany({
        where: {
          userId,
          purpose: 'wallet_deposit',
          status: 'PENDING',
          payAddress: { not: null },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    const sumByTypes = (types: WalletTxType[]) =>
      txs
        .filter((t) => types.includes(t.type))
        .reduce((s, t) => s + Number(t.amount), 0);

    const subscriptionPaid = payments
      .filter((p) =>
        [
          'registration',
          'setup_plan_premium',
          'setup_plan_pro',
          'profit_share',
          'mt5_sync',
          'investor_enrollment',
          'evaluation_enrollment',
        ].includes(p.purpose),
      )
      .reduce((s, p) => s + Number(p.amount), 0);

    const totalDeposited = sumByTypes(['DEPOSITOR_DEPOSIT', 'DEPOSIT']);
    const totalEarned = sumByTypes([
      'DEPOSITOR_EARNING',
      'INVESTOR_EARNING',
      'UNITRUST_EARNING',
    ]);
    const totalWithdrawn = Math.abs(
      sumByTypes(['DEPOSITOR_WITHDRAW', 'PAYOUT']),
    );

    const config = await this.getPlatformConfig();

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { country: true, preferredCurrency: true },
    });
    const resolved = resolvePreferredDisplayCurrency({
      preferredCurrency: profile?.preferredCurrency,
      country: profile?.country,
    });
    const displayCurrency = await this.fxRates.buildDisplayCurrency(resolved);

    const vipUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { investorVipActive: true, investorVipExpiresAt: true },
    });
    const vipActive = isInvestorVipActive(vipUser ?? {});
    const processingFeeUsdt = vipActive
      ? 0
      : Number(config?.walletWithdrawalFeeUsdt ?? WALLET_WITHDRAWAL_FEE_USD);
    const scheduleEnabled = config?.withdrawalScheduleEnabled !== false;
    const preferredSchedule = normalizePreferredSchedule(
      config?.withdrawalPreferredSchedule,
    );
    const offSchedulePenaltyPercent = Number(
      config?.withdrawalOffSchedulePenaltyPercent ?? 8,
    );
    const scheduleQuote = quoteWithdrawalFees({
      grossUsdt: 100,
      processingFeeUsdt,
      scheduleEnabled,
      preferredSchedule,
      offSchedulePenaltyPercent,
    });

    return {
      availableBalance: Number(wallet.availableBalance),
      lockedBalance: Number(wallet.lockedBalance),
      investorBalance: Number(wallet.investorBalance ?? 0),
      unitrustBalance: Number(wallet.unitrustBalance ?? 0),
      pendingWalletDeposits: pendingDeposits.length,
      pendingWalletDepositAmount: pendingDeposits.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      ),
      subscriptionPaid,
      totalDeposited,
      totalEarned,
      totalWithdrawn,
      displayCurrency,
      withdrawalFeeUsdt: processingFeeUsdt,
      withdrawalScheduleEnabled: scheduleEnabled,
      withdrawalPreferredSchedule: preferredSchedule,
      withdrawalOffSchedulePenaltyPercent: offSchedulePenaltyPercent,
      withdrawalInPreferredWindow: scheduleQuote.inPreferredWindow,
      withdrawalNextPreferredWindowAt: scheduleQuote.nextPreferredWindowAt,
      withdrawalPreferredWindowLabel: scheduleQuote.preferredWindowLabel,
      vipActive,
      activePlan: activePlan
        ? {
            id: activePlan.id,
            amount: Number(activePlan.amount),
            riskPercent: Number(activePlan.riskPercent),
            dailyYieldPercent: Number(activePlan.dailyYieldPercent),
            startAt: activePlan.startAt.toISOString(),
            endAt: activePlan.endAt.toISOString(),
            status: activePlan.status,
            credits: activePlan.credits.map((c) => ({
              dayIndex: c.dayIndex,
              amount: Number(c.amount),
              creditedAt: c.creditedAt.toISOString(),
            })),
          }
        : null,
      platformDailyYieldPercent: Number(
        config?.depositorDailyYieldPercent ?? 0.5,
      ),
      investorDailyYieldPercent: Number(
        config?.investorDailyYieldPercent ?? 0.5,
      ),
      minDepositUsdt: Number(config?.depositorMinDepositUsdt ?? 50),
    };
  }

  async getTransactions(userId: string, take = 50, skip = 0) {
    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.walletTransaction.count({ where: { userId } }),
    ]);
    return {
      items: items.map((t) => ({
        id: t.id,
        amount: Number(t.amount),
        type: t.type,
        description: t.description,
        referenceId: t.referenceId,
        balanceAfter: t.balanceAfter != null ? Number(t.balanceAfter) : null,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
    };
  }

  async debitBalance(
    userId: string,
    amount: number,
    type: WalletTxType,
    description: string,
    referenceId?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const wallet = await this.getOrCreateWallet(userId);
    const current = Number(wallet.availableBalance);
    if (current < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }
    const newBalance = current - amount;
    await this.prisma.$transaction([
      this.prisma.platformWallet.update({
        where: { userId },
        data: { availableBalance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          amount: -amount,
          type,
          description,
          referenceId,
          balanceAfter: newBalance,
        },
      }),
    ]);
    return { balance: newBalance };
  }

  async creditBalance(
    userId: string,
    amount: number,
    type: WalletTxType,
    description: string,
    referenceId?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const wallet = await this.getOrCreateWallet(userId);
    const newBalance = Number(wallet.availableBalance) + amount;
    await this.prisma.$transaction([
      this.prisma.platformWallet.update({
        where: { userId },
        data: { availableBalance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          amount,
          type,
          description,
          referenceId,
          balanceAfter: newBalance,
        },
      }),
    ]);
    return { balance: newBalance };
  }

  async adminCreditWallet(
    userId: string,
    amount: number,
    adminId: string,
    description?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const note =
      description?.trim() ||
      `Admin deposit — $${amount.toFixed(2)} USDT`;
    const { balance } = await this.creditBalance(
      userId,
      amount,
      'ADJUSTMENT',
      note,
      `admin_${adminId}`,
    );

    const emailSent = await this.notifications.notifyWalletAdminCredit(userId, {
      amount,
      balance,
      note,
    });

    return {
      userId,
      amount,
      balance,
      description: note,
      emailSent,
    };
  }

  /** Credits platform wallet for an admin referral settlement. */
  async creditReferralSettlement(
    userId: string,
    amount: number,
    settlementId: string,
    description: string,
  ) {
    return this.creditBalance(
      userId,
      amount,
      'REFERRAL_REWARD',
      description,
      settlementId,
    );
  }

  private depositBelowMinMessage(network: string) {
    return `Amount is below the minimum for ${network}. Try a higher amount or switch network.`;
  }

  async getDepositMinimum(network: string) {
    if (!this.nowPayments.isConfigured) {
      return {
        minUsdt: DEPOSIT_MIN_FALLBACK_USDT,
        network: network.toUpperCase(),
      };
    }
    try {
      const { minAmount, fiatEquivalent } =
        await this.nowPayments.getMinPaymentAmount(network, {
          fiatEquivalent: 'usd',
        });
      const minUsdt =
        Math.ceil(
          (fiatEquivalent ?? minAmount ?? DEPOSIT_MIN_FALLBACK_USDT) * 100,
        ) / 100;
      return {
        minUsdt: minUsdt > 0 ? minUsdt : DEPOSIT_MIN_FALLBACK_USDT,
        network: network.toUpperCase(),
      };
    } catch (err) {
      this.logger.warn(
        `Could not fetch deposit min for ${network}: ${err instanceof Error ? err.message : err}`,
      );
      return {
        minUsdt: DEPOSIT_MIN_FALLBACK_USDT,
        network: network.toUpperCase(),
      };
    }
  }

  async createDeposit(
    userId: string,
    network: string,
    amount: number,
    riskPercent?: number,
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Deposit amount must be greater than zero');
    }

    const { minUsdt } = await this.getDepositMinimum(network);
    if (amount < minUsdt) {
      throw new BadRequestException(this.depositBelowMinMessage(network));
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount,
        currency: 'USDT',
        network,
        purpose: 'wallet_deposit',
        gatewayId: `pending_${Date.now()}`,
        gatewayResponse: riskPercent
          ? ({ riskPercent } as object)
          : undefined,
      },
    });

    if (!this.nowPayments.isConfigured) {
      throw new ServiceUnavailableException(
        'Crypto deposits are not configured — contact support',
      );
    }

    try {
      const npPayment = await this.nowPayments.createPayment({
        amount,
        orderId: payment.id,
        network,
        description: 'TraderRank platform wallet deposit',
        ipnCallbackUrl: this.ipnUrl(),
      });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayId: String(npPayment.payment_id),
          gatewayResponse: {
            ...(npPayment as object),
            ...(riskPercent != null ? { riskPercent } : {}),
          } as object,
          payAddress: npPayment.pay_address,
          payAmount: npPayment.pay_amount,
        },
      });

      this.notifications.walletDepositInitiated(userId, {
        amount,
        paymentId: payment.id,
      });

      return {
        paymentId: payment.id,
        amount,
        currency: 'USDT',
        network,
        purpose: 'wallet_deposit',
        payCurrency: npPayment.pay_currency,
        payAmount: npPayment.pay_amount,
        payAddress: npPayment.pay_address,
        gatewayPaymentId: npPayment.payment_id,
        liveStatus: npPayment.payment_status,
        gateway: 'NOWPayments',
        orderId: payment.id,
      };
    } catch (err) {
      await this.prisma.payment
        .delete({ where: { id: payment.id } })
        .catch(() => undefined);
      if (err instanceof NowPaymentsApiError) {
        if (/less than minimal/i.test(err.message || '')) {
          throw new BadRequestException(this.depositBelowMinMessage(network));
        }
        throw new BadRequestException(
          err.message || 'Could not create deposit payment',
        );
      }
      throw err;
    }
  }

  async createMomoDeposit(
    userId: string,
    amount: number,
    momo: { phoneNumber: string; network: string; countryCode?: string },
    riskPercent?: number,
  ) {
    const minFlw = this.flutterwavePayments.getPublicConfig().minDepositUsd;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Deposit amount must be greater than zero');
    }
    if (amount < minFlw) {
      throw new BadRequestException(`Minimum MoMo deposit is $${minFlw} USDT`);
    }

    const result = await this.flutterwavePayments.initiatePayment({
      userId,
      purpose: 'wallet_deposit',
      amountUsd: amount,
      network: 'MOMO',
      momo,
      gatewayMeta: riskPercent != null ? { riskPercent } : undefined,
    });

    this.notifications.walletDepositInitiated(userId, {
      amount,
      paymentId: result.paymentId,
    });

    return result;
  }

  async confirmWalletDeposit(
    paymentId: string,
    gatewayPayload: object,
    opts?: { gatewayId?: string; txHash?: string },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.status === 'CONFIRMED') {
      return { alreadyConfirmed: true };
    }

    const stored = (payment.gatewayResponse ?? {}) as Record<string, unknown>;
    const riskPercent =
      typeof stored.riskPercent === 'number' ? stored.riskPercent : undefined;

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        gatewayResponse: gatewayPayload as object,
        ...(opts?.gatewayId ? { gatewayId: opts.gatewayId } : {}),
        ...(opts?.txHash ? { txHash: opts.txHash } : {}),
      },
    });

    const amount = Number(payment.amount);
    const wallet = await this.getOrCreateWallet(payment.userId);
    const newBalance = Number(wallet.availableBalance) + amount;

    await this.prisma.$transaction([
      this.prisma.platformWallet.update({
        where: { userId: payment.userId },
        data: { availableBalance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId: payment.userId,
          amount,
          type: 'DEPOSITOR_DEPOSIT',
          referenceId: paymentId,
          description: `Platform wallet deposit — $${amount.toFixed(2)} USDT`,
          balanceAfter: newBalance,
        },
      }),
      this.prisma.user.update({
        where: { id: payment.userId },
        data: { depositorActive: true },
      }),
    ]);

    this.notifications.walletDepositConfirmed(payment.userId, {
      amount,
      balance: newBalance,
    });

    if (riskPercent != null && riskPercent >= 0.5) {
      try {
        await this.createPlanFromBalance(
          payment.userId,
          amount,
          riskPercent,
        );
      } catch (err) {
        this.logger.warn(
          `Auto plan creation failed for ${payment.userId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { confirmed: true, amount, userId: payment.userId };
  }

  async createPlanFromBalance(
    userId: string,
    amount: number,
    riskPercent: number,
  ) {
    const preview = await this.previewDepositPlan(amount, riskPercent);
    const wallet = await this.getOrCreateWallet(userId);

    if (Number(wallet.availableBalance) < amount) {
      throw new BadRequestException('Insufficient wallet balance for plan');
    }

    const existing = await this.prisma.depositorPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have an active earning plan. Wait until it completes.',
      );
    }

    const now = new Date();
    const endAt = new Date(now.getTime() + PLAN_DAYS * 24 * 60 * 60 * 1000);
    const newAvailable = Number(wallet.availableBalance) - amount;
    const newLocked = Number(wallet.lockedBalance) + amount;

    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.platformWallet.update({
        where: { userId },
        data: {
          availableBalance: newAvailable,
          lockedBalance: newLocked,
        },
      });

      return tx.depositorPlan.create({
        data: {
          userId,
          amount,
          riskPercent,
          dailyYieldPercent: preview.dailyYieldPercent,
          startAt: now,
          endAt,
          status: DepositorPlanStatus.ACTIVE,
        },
      });
    });

    this.notifications.depositorPlanStarted(userId, {
      amount,
      riskPercent,
      dailyYieldPercent: preview.dailyYieldPercent,
      endAt: endAt.toISOString(),
    });

    return {
      planId: plan.id,
      ...preview,
      startAt: now.toISOString(),
      endAt: endAt.toISOString(),
    };
  }

  async createPlan(
    userId: string,
    amount: number,
    riskPercent: number,
  ) {
    return this.createPlanFromBalance(userId, amount, riskPercent);
  }

  async creditDailyEarnings() {
    const now = new Date();
    const activePlans = await this.prisma.depositorPlan.findMany({
      where: { status: DepositorPlanStatus.ACTIVE },
      include: { credits: true },
    });

    let credited = 0;
    for (const plan of activePlans) {
      if (now >= plan.endAt) {
        await this.completePlan(plan.id, plan.userId, Number(plan.amount));
        continue;
      }

      // Full 24h periods only — no same-day credit after deposit (anti-gaming).
      const msPerDay = 24 * 60 * 60 * 1000;
      const elapsedDays = Math.floor(
        (now.getTime() - plan.startAt.getTime()) / msPerDay,
      );
      const dayIndex = Math.min(elapsedDays, PLAN_DAYS);
      const creditedDays = new Set(plan.credits.map((c) => c.dayIndex));

      if (dayIndex < 1 || creditedDays.has(dayIndex)) continue;

      const earningAmount =
        (Number(plan.amount) * Number(plan.dailyYieldPercent)) / 100;

      const wallet = await this.getOrCreateWallet(plan.userId);
      const newBalance = Number(wallet.availableBalance) + earningAmount;

      await this.prisma.$transaction([
        this.prisma.depositorDailyCredit.create({
          data: {
            planId: plan.id,
            dayIndex,
            amount: earningAmount,
          },
        }),
        this.prisma.platformWallet.update({
          where: { userId: plan.userId },
          data: { availableBalance: newBalance },
        }),
        this.prisma.walletTransaction.create({
          data: {
            userId: plan.userId,
            amount: earningAmount,
            type: 'DEPOSITOR_EARNING',
            referenceId: plan.id,
            description: `Day ${dayIndex} platform earning — $${earningAmount.toFixed(2)} USDT`,
            balanceAfter: newBalance,
          },
        }),
      ]);

      this.notifications.depositorDailyEarning(plan.userId, {
        dayIndex,
        amount: earningAmount,
        balance: newBalance,
      });
      credited++;
    }

    return { credited };
  }

  async getDailyIncomeJournal(userId: string, take = 50, skip = 0) {
    const [investorCredits, depositorCredits, investorTotal, depositorTotal] =
      await Promise.all([
        this.prisma.investorDailyCredit.findMany({
          where: { userId },
          orderBy: { creditDate: 'desc' },
        }),
        this.prisma.depositorDailyCredit.findMany({
          where: { plan: { userId } },
          include: { plan: { select: { amount: true, dailyYieldPercent: true } } },
          orderBy: { creditedAt: 'desc' },
        }),
        this.prisma.investorDailyCredit.count({ where: { userId } }),
        this.prisma.depositorDailyCredit.count({
          where: { plan: { userId } },
        }),
      ]);

    const items = [
      ...investorCredits.map((c) => ({
        id: c.id,
        source: 'INVESTOR' as const,
        amount: Number(c.amount),
        yieldPercent: Number(c.yieldPercent),
        baseBalance: Number(c.baseBalance),
        creditDate: c.creditDate.toISOString().slice(0, 10),
        dayIndex: null as number | null,
        creditedAt: c.creditedAt.toISOString(),
      })),
      ...depositorCredits.map((c) => ({
        id: c.id,
        source: 'DEPOSITOR' as const,
        amount: Number(c.amount),
        yieldPercent: Number(c.plan.dailyYieldPercent),
        baseBalance: Number(c.plan.amount),
        creditDate: c.creditedAt.toISOString().slice(0, 10),
        dayIndex: c.dayIndex,
        creditedAt: c.creditedAt.toISOString(),
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.creditedAt).getTime() - new Date(a.creditedAt).getTime(),
      )
      .slice(skip, skip + take);

    return { items, total: investorTotal + depositorTotal };
  }

  async getDailyCalendar(userId: string, year: number, month: number) {
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Invalid year');
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      throw new BadRequestException('Invalid month');
    }

    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const transactions = await this.prisma.walletTransaction.findMany({
      where: {
        userId,
        createdAt: { gte: start, lt: end },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        amount: true,
        type: true,
        description: true,
        createdAt: true,
      },
    });

    const days: Record<
      string,
      {
        date: string;
        net: number;
        transactions: Array<{
          amount: number;
          type: string;
          description: string;
        }>;
      }
    > = {};

    for (const tx of transactions) {
      const date = tx.createdAt.toISOString().slice(0, 10);
      if (!days[date]) {
        days[date] = { date, net: 0, transactions: [] };
      }
      const amount = Number(tx.amount);
      days[date].net += amount;
      days[date].transactions.push({
        amount,
        type: tx.type,
        description: tx.description,
      });
    }

    const monthNet = Object.values(days).reduce((sum, d) => sum + d.net, 0);
    const summary = this.buildCalendarMonthSummary(days, monthNet);

    return { year, month, monthNet, days, summary };
  }

  private buildCalendarMonthSummary(
    days: Record<
      string,
      {
        date: string;
        net: number;
        transactions: Array<{
          amount: number;
          type: string;
          description: string;
        }>;
      }
    >,
    monthNet: number,
  ) {
    const dayList = Object.values(days);
    let creditTotal = 0;
    let debitTotal = 0;
    const byType: Record<string, number> = {};
    let bestDay: { date: string; net: number } | null = null;
    let worstDay: { date: string; net: number } | null = null;

    for (const day of dayList) {
      if (!bestDay || day.net > bestDay.net) {
        bestDay = { date: day.date, net: day.net };
      }
      if (!worstDay || day.net < worstDay.net) {
        worstDay = { date: day.date, net: day.net };
      }
      for (const tx of day.transactions) {
        if (tx.amount > 0) creditTotal += tx.amount;
        else if (tx.amount < 0) debitTotal += Math.abs(tx.amount);
        byType[tx.type] = (byType[tx.type] ?? 0) + tx.amount;
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const byTypeSorted = Object.entries(byType)
      .map(([type, amount]) => ({ type, amount: round2(amount) }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    return {
      activeDays: dayList.length,
      creditTotal: round2(creditTotal),
      debitTotal: round2(debitTotal),
      monthNet: round2(monthNet),
      bestDay,
      worstDay,
      byType: byTypeSorted,
      dailyNets: dayList
        .map((d) => ({ date: d.date, net: round2(d.net), txCount: d.transactions.length }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async sendMonthlyJournalReport(userId: string, year: number, month: number) {
    const calendar = await this.getDailyCalendar(userId, year, month);
    const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
      'en-US',
      { month: 'long', year: 'numeric', timeZone: 'UTC' },
    );

    const sent = await this.notifications.journalMonthlyReport(userId, {
      year,
      month,
      monthLabel: monthName,
      summary: calendar.summary,
    });

    if (!sent) {
      throw new BadRequestException(
        'Could not send the report — add an email to your account or try again',
      );
    }

    return {
      ok: true,
      year,
      month,
      monthLabel: monthName,
      monthNet: calendar.monthNet,
      summary: calendar.summary,
      message: `Monthly journal summary for ${monthName} was emailed to you`,
    };
  }

  private async completePlan(planId: string, userId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(userId);
    const newLocked = Math.max(0, Number(wallet.lockedBalance) - amount);
    const newAvailable = Number(wallet.availableBalance) + amount;

    await this.prisma.$transaction([
      this.prisma.depositorPlan.update({
        where: { id: planId },
        data: { status: DepositorPlanStatus.COMPLETED },
      }),
      this.prisma.platformWallet.update({
        where: { userId },
        data: {
          lockedBalance: newLocked,
          availableBalance: newAvailable,
        },
      }),
    ]);

    this.notifications.depositorPlanCompleted(userId, { amount });
  }

  async requestWithdrawOtp(
    userId: string,
    amount: number,
    savedWalletId: string,
  ) {
    await this.compliance.requireKycForPayout(userId);

    if (!savedWalletId?.trim()) {
      throw new BadRequestException(
        'Select a saved withdrawal wallet or add one before withdrawing',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        status: true,
        investorVipActive: true,
        investorVipExpiresAt: true,
      },
    });
    if (!user?.email?.trim()) {
      throw new BadRequestException(
        'Add an email address to your account to withdraw',
      );
    }
    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      throw new BadRequestException('Account cannot withdraw');
    }

    const grossAmount = Math.round(amount * 100) / 100;
    await this.assertWithdrawAmountValid(grossAmount, user);

    const savedWallet = await this.savedWithdrawalWallets.getForWithdraw(
      userId,
      savedWalletId.trim(),
    );

    const platformWallet = await this.getOrCreateWallet(userId);
    if (Number(platformWallet.availableBalance) < grossAmount) {
      throw new BadRequestException('Insufficient available balance');
    }

    const recent = await this.prisma.withdrawOtp.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < WITHDRAW_OTP_RESEND_COOLDOWN_MS
    ) {
      const waitSec = Math.ceil(
        (WITHDRAW_OTP_RESEND_COOLDOWN_MS -
          (Date.now() - recent.createdAt.getTime())) /
          1000,
      );
      throw new BadRequestException(
        `Wait ${waitSec}s before requesting another withdrawal code`,
      );
    }

    await this.prisma.withdrawOtp.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const email = user.email.trim().toLowerCase();
    const code = String(randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(code, 10);

    const session = await this.prisma.withdrawOtp.create({
      data: {
        userId,
        email,
        codeHash,
        amount: grossAmount,
        savedWalletId: savedWallet.id,
        expiresAt: new Date(Date.now() + WITHDRAW_OTP_TTL_MS),
      },
    });

    const emailSent = await this.notifications.withdrawalOtp(email, code, {
      amount: grossAmount,
      walletLabel: savedWallet.label,
      network: savedWallet.network,
      address: savedWallet.address,
    });
    if (!emailSent) {
      await this.prisma.withdrawOtp.update({
        where: { id: session.id },
        data: { usedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        'Could not send verification email. Try again shortly.',
      );
    }

    return {
      sessionId: session.id,
      email,
      amount: grossAmount,
      savedWalletId: savedWallet.id,
      message: 'Check your email for a 6-digit withdrawal code',
      expiresIn: WITHDRAW_OTP_TTL_MS / 1000,
    };
  }

  private async assertWithdrawAmountValid(
    grossAmount: number,
    vipUser: {
      investorVipActive?: boolean | null;
      investorVipExpiresAt?: Date | null;
    },
  ) {
    const config = await this.getPlatformConfig();
    const processingFee = isInvestorVipActive(vipUser)
      ? 0
      : Number(config?.walletWithdrawalFeeUsdt ?? WALLET_WITHDRAWAL_FEE_USD);
    const scheduleEnabled = config?.withdrawalScheduleEnabled !== false;
    const preferredSchedule = normalizePreferredSchedule(
      config?.withdrawalPreferredSchedule,
    );
    const offSchedulePenaltyPercent = Number(
      config?.withdrawalOffSchedulePenaltyPercent ?? 8,
    );
    const quote = quoteWithdrawalFees({
      grossUsdt: grossAmount,
      processingFeeUsdt: processingFee,
      scheduleEnabled,
      preferredSchedule,
      offSchedulePenaltyPercent,
    });
    const fee = quote.totalFeesUsdt;
    const netPayout = quote.netPayoutUsdt;
    const processingFeeOnly = quote.processingFeeUsdt;
    const penaltyUsdt = quote.penaltyUsdt;

    if (grossAmount <= 0) {
      throw new BadRequestException('Withdrawal amount must be positive');
    }
    if (fee > 0 && grossAmount <= fee) {
      throw new BadRequestException(
        penaltyUsdt > 0
          ? `Minimum withdrawal is $${(fee + 0.01).toFixed(2)} USDT (includes $${processingFeeOnly.toFixed(2)} processing fee + $${penaltyUsdt.toFixed(2)} off-schedule penalty). Preferred free-penalty window: ${quote.preferredWindowLabel}.`
          : `Minimum withdrawal is $${(fee + 0.01).toFixed(2)} USDT (includes $${processingFeeOnly.toFixed(2)} processing fee)`,
      );
    }
    if (netPayout <= 0) {
      throw new BadRequestException('Withdrawal amount is too small after fees');
    }
  }

  private async consumeWithdrawOtp(
    userId: string,
    amount: number,
    savedWalletId: string,
    sessionId: string,
    code: string,
  ) {
    if (!sessionId?.trim() || !code?.trim()) {
      throw new BadRequestException(
        'Enter the email verification code to withdraw',
      );
    }

    const session = await this.prisma.withdrawOtp.findUnique({
      where: { id: sessionId.trim() },
    });

    if (!session || session.userId !== userId || session.usedAt) {
      throw new BadRequestException('Invalid or expired withdrawal code session');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Withdrawal code expired — request a new one',
      );
    }
    if (session.attempts >= WITHDRAW_OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many attempts — request a new code');
    }

    const grossAmount = Math.round(amount * 100) / 100;
    if (Number(session.amount) !== grossAmount) {
      throw new BadRequestException(
        'Withdrawal amount no longer matches the emailed code — request a new code',
      );
    }
    if (session.savedWalletId !== savedWalletId.trim()) {
      throw new BadRequestException(
        'Withdrawal destination no longer matches the emailed code — request a new code',
      );
    }

    const valid = await bcrypt.compare(code.trim(), session.codeHash);
    if (!valid) {
      await this.prisma.withdrawOtp.update({
        where: { id: session.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect withdrawal verification code');
    }

    await this.prisma.withdrawOtp.update({
      where: { id: session.id },
      data: { usedAt: new Date() },
    });
  }

  async withdraw(
    userId: string,
    amount: number,
    savedWalletId: string,
    otp: { sessionId: string; code: string },
  ) {
    await this.compliance.requireKycForPayout(userId);

    if (!savedWalletId?.trim()) {
      throw new BadRequestException(
        'Select a saved withdrawal wallet or add one before withdrawing',
      );
    }

    await this.consumeWithdrawOtp(
      userId,
      amount,
      savedWalletId,
      otp.sessionId,
      otp.code,
    );

    const grossAmount = Math.round(amount * 100) / 100;
    const vipUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        investorVipActive: true,
        investorVipExpiresAt: true,
        instantWithdraw: true,
      },
    });
    const instantWithdraw = Boolean(vipUser?.instantWithdraw);
    const config = await this.getPlatformConfig();
    const processingFee = isInvestorVipActive(vipUser ?? {})
      ? 0
      : Number(config?.walletWithdrawalFeeUsdt ?? WALLET_WITHDRAWAL_FEE_USD);
    const scheduleEnabled = config?.withdrawalScheduleEnabled !== false;
    const preferredSchedule = normalizePreferredSchedule(
      config?.withdrawalPreferredSchedule,
    );
    const offSchedulePenaltyPercent = Number(
      config?.withdrawalOffSchedulePenaltyPercent ?? 8,
    );
    const quote = quoteWithdrawalFees({
      grossUsdt: grossAmount,
      processingFeeUsdt: processingFee,
      scheduleEnabled,
      preferredSchedule,
      offSchedulePenaltyPercent,
    });
    const fee = quote.totalFeesUsdt;
    const netPayout = quote.netPayoutUsdt;
    const processingFeeOnly = quote.processingFeeUsdt;
    const penaltyUsdt = quote.penaltyUsdt;

    if (grossAmount <= 0) {
      throw new BadRequestException('Withdrawal amount must be positive');
    }
    if (fee > 0 && grossAmount <= fee) {
      throw new BadRequestException(
        penaltyUsdt > 0
          ? `Minimum withdrawal is $${(fee + 0.01).toFixed(2)} USDT (includes $${processingFeeOnly.toFixed(2)} processing fee + $${penaltyUsdt.toFixed(2)} off-schedule penalty). Preferred free-penalty window: ${quote.preferredWindowLabel}.`
          : `Minimum withdrawal is $${(fee + 0.01).toFixed(2)} USDT (includes $${processingFeeOnly.toFixed(2)} processing fee)`,
      );
    }
    if (netPayout <= 0) {
      throw new BadRequestException('Withdrawal amount is too small after fees');
    }

    const savedWallet = await this.savedWithdrawalWallets.getForWithdraw(
      userId,
      savedWalletId.trim(),
    );

    const platformWallet = await this.getOrCreateWallet(userId);
    if (Number(platformWallet.availableBalance) < grossAmount) {
      throw new BadRequestException('Insufficient available balance');
    }

    const isMomo = isMomoWithdrawalNetwork(savedWallet.network);
    const destination = savedWallet.address;
    const method = isMomo ? ('MOBILE_MONEY' as const) : ('TRC20' as const);
    const walletLabel = savedWallet.label;

    const newBalance = Number(platformWallet.availableBalance) - grossAmount;
    const { weekNumber, year } = this.isoWeekYear(new Date());

    const feeLabel =
      penaltyUsdt > 0
        ? `$${processingFeeOnly.toFixed(2)} fee + $${penaltyUsdt.toFixed(2)} off-schedule penalty (${quote.penaltyPercent}%)`
        : processingFeeOnly > 0
          ? `$${processingFeeOnly.toFixed(2)} fee`
          : 'VIP $0 fee';

    const payout = await this.prisma.$transaction(async (tx) => {
      await tx.platformWallet.update({
        where: { userId },
        data: { availableBalance: newBalance },
      });
      await tx.walletTransaction.create({
        data: {
          userId,
          amount: -grossAmount,
          type: 'DEPOSITOR_WITHDRAW',
          description: isMomo
            ? `MoMo withdrawal — $${grossAmount.toFixed(2)} USDT (${feeLabel}, $${netPayout.toFixed(2)} payout) → ${walletLabel}`
            : `Wallet withdrawal — $${grossAmount.toFixed(2)} USDT (${feeLabel}, $${netPayout.toFixed(2)} payout) → ${walletLabel}`,
          balanceAfter: newBalance,
        },
      });
      return tx.payout.create({
        data: {
          userId,
          source: 'DEPOSITOR',
          virtualProfit: grossAmount,
          traderShare: netPayout,
          platformShare: fee,
          traderPercent:
            grossAmount > 0
              ? Math.round((netPayout / grossAmount) * 10000) / 100
              : 100,
          weekNumber,
          year,
          status: 'PENDING',
          walletAddress: destination,
          payoutMethod: method,
          notes: [
            isMomo ? 'MoMo' : 'Platform wallet',
            `withdrawal — $${grossAmount.toFixed(2)} USDT gross`,
            `$${processingFeeOnly.toFixed(2)} processing fee`,
            penaltyUsdt > 0
              ? `$${penaltyUsdt.toFixed(2)} off-schedule penalty (${quote.penaltyPercent}% · preferred ${quote.preferredWindowLabel})`
              : `on-schedule (${quote.preferredWindowLabel})`,
            `$${netPayout.toFixed(2)} USDT payout → ${walletLabel} (${savedWallet.network})`,
          ].join(', '),
        },
      });
    });

    if (instantWithdraw && !isMomo) {
      try {
        const result = await this.payouts.approveAndSendPayout(
          payout.id,
          `instant_${userId}`,
        );
        const gatewayPayoutId =
          'gatewayPayoutId' in result ? result.gatewayPayoutId : undefined;
        this.notifications.walletWithdrawInstantExecuted(userId, {
          amount: grossAmount,
          netPayout,
          fee,
          payoutId: payout.id,
          destination,
          walletLabel,
          gatewayPayoutId,
        });
        return {
          status: 'instant' as const,
          payoutId: payout.id,
          amount: grossAmount,
          fee,
          netPayout,
          balance: newBalance,
          payoutStatus:
            result &&
            typeof result === 'object' &&
            'payout' in result &&
            result.payout &&
            typeof result.payout === 'object' &&
            'status' in result.payout
              ? String(result.payout.status)
              : 'APPROVED',
          gatewayPayoutId: gatewayPayoutId ?? null,
          message:
            'message' in result && typeof result.message === 'string'
              ? result.message
              : 'Withdrawal is being sent to your saved wallet.',
        };
      } catch (err) {
        this.logger.error(
          `Instant withdraw failed for user ${userId} payout ${payout.id}: ${err instanceof Error ? err.message : err}`,
        );
        // Fall back to the normal pending-approval flow — funds are already
        // debited to the payout so admin can still approve/refund by hand.
        this.notifications.walletWithdrawRequested(userId, {
          amount: grossAmount,
          payoutId: payout.id,
          destination,
        });
        return {
          status: 'requested' as const,
          payoutId: payout.id,
          amount: grossAmount,
          fee,
          netPayout,
          balance: newBalance,
          instantFailure:
            err instanceof Error ? err.message : 'Instant payout failed',
        };
      }
    }

    if (isMomo) {
      const recipient = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, email: true },
      });
      let rateQuote;
      try {
        rateQuote = await this.binanceC2c.quoteUsdtToUgx(netPayout);
      } catch (err) {
        this.logger.error(
          `MoMo P2P quote failed for payout ${payout.id}: ${err instanceof Error ? err.message : err}`,
        );
        throw new ServiceUnavailableException(
          'Could not fetch Binance MoMo rate — try again shortly',
        );
      }

      const p2p = await this.prisma.momoP2pWithdrawal.create({
        data: {
          userId,
          payoutId: payout.id,
          amountUsdt: netPayout,
          amountUgx: rateQuote.amountUgx,
          rateUgxPerUsdt: rateQuote.price,
          momoNetwork: savedWallet.network,
          momoPhone: destination,
          momoLabel: walletLabel,
          recipientName: recipient?.displayName ?? null,
          status: 'INITIATED',
        },
      });

      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          notes: [
            'MoMo P2P',
            `$${grossAmount.toFixed(2)} USDT gross`,
            `$${netPayout.toFixed(2)} USDT → UGX ${rateQuote.amountUgx.toLocaleString('en-US')} @ ${rateQuote.price}`,
            `send to ${destination} (${savedWallet.network})`,
            `who: ${recipient?.displayName ?? userId}${recipient?.email ? ` <${recipient.email}>` : ''}`,
            `p2p ${p2p.id}`,
          ].join(', '),
        },
      });

      this.notifications.walletWithdrawRequested(userId, {
        amount: grossAmount,
        payoutId: payout.id,
        destination,
      });

      const emailSent = await this.notifications.notifyMomoP2pOps({
        userId,
        userName: recipient?.displayName ?? 'User',
        userEmail: recipient?.email ?? null,
        payoutId: payout.id,
        p2pId: p2p.id,
        amountUsdt: netPayout,
        amountUgx: rateQuote.amountUgx,
        rateUgxPerUsdt: rateQuote.price,
        momoPhone: destination,
        momoNetwork: savedWallet.network,
        momoLabel: walletLabel,
      });

      const underProcess = await this.prisma.momoP2pWithdrawal.update({
        where: { id: p2p.id },
        data: {
          status: 'UNDER_PROCESS',
          opsEmailSentAt: emailSent ? new Date() : new Date(),
        },
      });

      return {
        status: 'momo_p2p' as const,
        payoutId: payout.id,
        p2pId: p2p.id,
        amount: grossAmount,
        fee,
        netPayout,
        balance: newBalance,
        amountUgx: rateQuote.amountUgx,
        rateUgxPerUsdt: rateQuote.price,
        momoPhone: destination,
        momoNetwork: savedWallet.network,
        p2p: this.serializeMomoP2p(underProcess),
        message:
          'Withdraw initiated. MoMo transfer is under process — confirm when the money arrives.',
      };
    }

    this.notifications.walletWithdrawRequested(userId, {
      amount: grossAmount,
      payoutId: payout.id,
      destination,
    });

    return {
      status: 'requested' as const,
      payoutId: payout.id,
      amount: grossAmount,
      fee,
      netPayout,
      balance: newBalance,
    };
  }

  private isoWeekYear(date: Date): { weekNumber: number; year: number } {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return { weekNumber, year: d.getUTCFullYear() };
  }
}
