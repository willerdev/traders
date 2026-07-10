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
import { DepositorPlanStatus, WalletTxType } from '@prisma/client';
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
import { SavedWithdrawalWalletService } from './saved-withdrawal-wallet.service';

const PLAN_DAYS = 5;
const DEPOSIT_MIN_FALLBACK_USDT = 10;

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
  ) {}

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
        ].includes(p.purpose),
      )
      .reduce((s, p) => s + Number(p.amount), 0);

    const totalDeposited = sumByTypes(['DEPOSITOR_DEPOSIT', 'DEPOSIT']);
    const totalEarned = sumByTypes(['DEPOSITOR_EARNING', 'INVESTOR_EARNING']);
    const totalWithdrawn = Math.abs(
      sumByTypes(['DEPOSITOR_WITHDRAW', 'PAYOUT']),
    );

    const config = await this.getPlatformConfig();

    return {
      availableBalance: Number(wallet.availableBalance),
      lockedBalance: Number(wallet.lockedBalance),
      pendingWalletDeposits: pendingDeposits.length,
      pendingWalletDepositAmount: pendingDeposits.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      ),
      subscriptionPaid,
      totalDeposited,
      totalEarned,
      totalWithdrawn,
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
      `Platform credit — $${amount.toFixed(2)} USDT`;
    const { balance } = await this.creditBalance(
      userId,
      amount,
      'ADJUSTMENT',
      note,
      `admin_${adminId}`,
    );

    this.notifications.walletAdminCredit(userId, { amount, balance });

    return {
      userId,
      amount,
      balance,
      description: note,
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

      const msPerDay = 24 * 60 * 60 * 1000;
      const elapsedDays = Math.floor(
        (now.getTime() - plan.startAt.getTime()) / msPerDay,
      );
      const dayIndex = Math.min(elapsedDays + 1, PLAN_DAYS);
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

    return { year, month, monthNet, days };
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

  async withdraw(userId: string, amount: number, savedWalletId: string) {
    await this.compliance.requireKycForPayout(userId);

    if (!savedWalletId?.trim()) {
      throw new BadRequestException(
        'Select a saved withdrawal wallet or add one before withdrawing',
      );
    }

    const grossAmount = Math.round(amount * 100) / 100;
    const fee = WALLET_WITHDRAWAL_FEE_USD;
    const netPayout = Math.round((grossAmount - fee) * 100) / 100;

    if (grossAmount <= 0) {
      throw new BadRequestException('Withdrawal amount must be positive');
    }
    if (grossAmount <= fee) {
      throw new BadRequestException(
        `Minimum withdrawal is $${(fee + 0.01).toFixed(2)} USDT (includes $${fee.toFixed(2)} processing fee)`,
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

    const destination = savedWallet.address;
    const method = 'TRC20' as const;
    const walletLabel = savedWallet.label;

    const newBalance = Number(platformWallet.availableBalance) - grossAmount;
    const { weekNumber, year } = this.isoWeekYear(new Date());

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
          description: `Wallet withdrawal — $${grossAmount.toFixed(2)} USDT ($${fee.toFixed(2)} fee, $${netPayout.toFixed(2)} payout) → ${walletLabel}`,
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
          traderPercent: Math.round((netPayout / grossAmount) * 10000) / 100,
          weekNumber,
          year,
          status: 'PENDING',
          walletAddress: destination,
          payoutMethod: method,
          notes: `Platform wallet withdrawal — $${grossAmount.toFixed(2)} USDT gross, $${fee.toFixed(2)} fee, $${netPayout.toFixed(2)} USDT payout → ${walletLabel} (${savedWallet.network})`,
        },
      });
    });

    this.notifications.walletWithdrawRequested(userId, {
      amount: grossAmount,
      payoutId: payout.id,
      destination,
    });

    return {
      status: 'requested',
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
