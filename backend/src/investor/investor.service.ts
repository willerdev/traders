import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { MetaApiService } from '../metaapi/metaapi.service';
import { WalletService } from '../wallet/wallet.service';
import {
  INVESTOR_INVESTMENT_MAX,
  INVESTOR_INVESTMENT_MIN,
  listInvestorFeeTiers,
  resolveInvestorSubscriptionFee,
} from './investor-fee.util';
import {
  INVESTOR_VIP_FEE_USDT,
  INVESTOR_VIP_REMINDER_DAYS,
  isInvestorVipActive,
  nextVipExpiry,
} from './investor-vip.util';
import { FxRatesService } from '../fx/fx-rates.service';
import { resolvePreferredDisplayCurrency } from '../fx/country-currency.util';

@Injectable()
export class InvestorService {
  private readonly logger = new Logger(InvestorService.name);

  constructor(
    private prisma: PrismaService,
    private nowPayments: NowPaymentsService,
    private config: ConfigService,
    private notifications: NotificationService,
    private metaApi: MetaApiService,
    @Inject(forwardRef(() => WalletService))
    private walletService: WalletService,
    private fxRates: FxRatesService,
  ) {}

  private ipnUrl() {
    const base = resolvePublicApiBaseUrl(this.config);
    const url = `${base}/api/v1/payments/ipn`;
    if (process.env.NODE_ENV === 'production' && !isPublicHttpsUrl(url)) {
      return undefined;
    }
    return url;
  }

  /** @deprecated Prefer resolveFeeForInvestment — flat config is no longer the source of truth. */
  async investorFee(): Promise<number> {
    return listInvestorFeeTiers()[0]?.fee ?? 10;
  }

  resolveFeeForInvestment(investmentAmount: number): number {
    try {
      return resolveInvestorSubscriptionFee(investmentAmount);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid investment amount',
      );
    }
  }

  private normalizeInvestmentAmount(raw: unknown): number {
    const amount = Math.round(Number(raw) * 100) / 100;
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('Investment amount is required');
    }
    if (amount < INVESTOR_INVESTMENT_MIN || amount > INVESTOR_INVESTMENT_MAX) {
      throw new BadRequestException(
        `Investment must be between $${INVESTOR_INVESTMENT_MIN} and $${INVESTOR_INVESTMENT_MAX} USDT`,
      );
    }
    return amount;
  }

  /** Deposit T → fee F deducted → net N invested. */
  private splitDeposit(raw: unknown): {
    deposit: number;
    fee: number;
    netInvested: number;
  } {
    const deposit = this.normalizeInvestmentAmount(raw);
    const fee = this.resolveFeeForInvestment(deposit);
    const netInvested = Math.round((deposit - fee) * 100) / 100;
    if (netInvested <= 0) {
      throw new BadRequestException(
        'Deposit must be greater than the subscription fee for that tier',
      );
    }
    return { deposit, fee, netInvested };
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        platformWallet: true,
        investorSettings: true,
        profile: { select: { country: true, preferredCurrency: true } },
        investorTrades: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { signal: { select: { signalId: true, symbol: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    let mt5Connected = false;
    let mt5HealthMessage: string | null = null;
    if (user.metaApiAccountId && this.metaApi.isConfigured) {
      try {
        const account = await this.metaApi.getAccount(user.metaApiAccountId);
        mt5Connected =
          account.state === 'DEPLOYED' &&
          account.connectionStatus === 'CONNECTED';
        mt5HealthMessage = mt5Connected
          ? 'MT5 account connected'
          : `MT5 ${account.connectionStatus}`;
      } catch (err) {
        mt5HealthMessage =
          err instanceof Error ? err.message : 'MT5 connection check failed';
      }
    }

    const feeTiers = listInvestorFeeTiers();
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const platformDailyYield = Number(config?.investorDailyYieldPercent ?? 8);
    const effectiveDailyYield =
      user.investorSettings?.dailyYieldPercent != null
        ? Number(user.investorSettings.dailyYieldPercent)
        : platformDailyYield;

    const financials = await this.getInvestorFinancials(userId, user);
    const vipActive = isInvestorVipActive(user);
    const resolved = resolvePreferredDisplayCurrency({
      preferredCurrency: user.profile?.preferredCurrency,
      country: user.profile?.country,
    });
    const displayCurrency = await this.fxRates.buildDisplayCurrency(resolved);

    return {
      active: user.investorActive,
      enrolledAt: user.investorEnrolledAt?.toISOString() ?? null,
      vip: {
        active: vipActive,
        expiresAt: user.investorVipExpiresAt?.toISOString() ?? null,
        feeUsdt: INVESTOR_VIP_FEE_USDT,
        benefits: {
          weekendEarnings: true,
          zeroWithdrawalFee: true,
        },
      },
      feeUsdt: feeTiers[0]?.fee ?? 10,
      feeTiers,
      investmentMin: INVESTOR_INVESTMENT_MIN,
      investmentMax: INVESTOR_INVESTMENT_MAX,
      committedInvestmentAmount:
        user.investorSettings?.committedInvestmentAmount != null
          ? Number(user.investorSettings.committedInvestmentAmount)
          : null,
      dailyYieldPercent: effectiveDailyYield,
      platformDailyYieldPercent: platformDailyYield,
      displayCurrency,
      mt5Linked: Boolean(user.metaApiAccountId),
      mt5Connected,
      mt5HealthMessage,
      ...financials,
      settings: user.investorSettings
        ? {
            riskPercent: Number(user.investorSettings.riskPercent),
            useTwoToOneRr: user.investorSettings.useTwoToOneRr,
            paused: user.investorSettings.paused,
            yieldPaused: user.investorSettings.yieldPaused,
          }
        : null,
      recentTrades: user.investorTrades.map((t) => ({
        id: t.id,
        signalId: t.signal.signalId,
        symbol: t.symbol,
        direction: t.direction,
        status: t.status,
        profit: t.profit != null ? Number(t.profit) : null,
        notes: t.notes,
        executedAt: t.executedAt?.toISOString() ?? null,
        closedAt: t.closedAt?.toISOString() ?? null,
      })),
    };
  }

  private async getInvestorFinancials(
    userId: string,
    user: {
      metaApiAccountId: string | null;
      platformWallet: {
        availableBalance: unknown;
        investorBalance?: unknown;
      } | null;
    },
  ) {
    const [
      feeAgg,
      depositAgg,
      allocateAgg,
      tradingProfitAgg,
      walletEarningsAgg,
    ] = await Promise.all([
      this.prisma.walletTransaction.aggregate({
        where: { userId, type: 'INVESTOR_FEE' },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: {
          userId,
          type: { in: ['DEPOSIT', 'DEPOSITOR_DEPOSIT'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { userId, type: 'INVESTOR_ALLOCATE' },
        _sum: { amount: true },
      }),
      this.prisma.investorTrade.aggregate({
        where: { userId, status: 'CLOSED', profit: { not: null } },
        _sum: { profit: true },
      }),
      this.prisma.investorDailyCredit.aggregate({
        where: { userId },
        _sum: { amount: true },
      }),
    ]);

    const enrollmentPaid = Math.abs(Number(feeAgg._sum.amount ?? 0));
    const walletDeposited = Number(depositAgg._sum.amount ?? 0);
    const allocatedToInvestment = Math.abs(Number(allocateAgg._sum.amount ?? 0));
    const walletBalance = Number(user.platformWallet?.availableBalance ?? 0);
    const investmentBalance = Number(user.platformWallet?.investorBalance ?? 0);
    const investmentDeposited = allocatedToInvestment;
    const tradingProfit = Number(tradingProfitAgg._sum.profit ?? 0);
    const walletEarnings = Number(walletEarningsAgg._sum.amount ?? 0);
    const totalProfit = tradingProfit + walletEarnings;

    let mt5Balance: number | null = null;
    let mt5Equity: number | null = null;
    let currency = 'USD';

    const accountId = user.metaApiAccountId?.trim();
    if (accountId && this.metaApi.isConfigured) {
      try {
        const account = await this.metaApi.getAccount(accountId);
        const info = await this.metaApi.getAccountInformation(account);
        mt5Balance = info.balance;
        mt5Equity = info.equity;
        currency = info.currency;
      } catch (err) {
        this.logger.warn(
          `Investor MT5 balance read failed for ${userId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    return {
      investmentDeposited,
      investmentBalance,
      enrollmentPaid,
      walletDeposited,
      walletBalance,
      tradingProfit,
      walletEarnings,
      totalProfit,
      mt5Balance,
      mt5Equity,
      currency,
    };
  }

  async createEnrollmentCheckout(
    userId: string,
    network: string,
    source: 'wallet' | 'crypto' = 'crypto',
    investmentAmountRaw?: number,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.investorActive) {
      return {
        message: 'Investor program is already active',
        active: true,
        enrolledAt: user.investorEnrolledAt?.toISOString() ?? null,
      };
    }

    const { deposit, fee, netInvested } = this.splitDeposit(investmentAmountRaw);

    if (source === 'wallet') {
      return this.payEnrollmentFromWallet(userId, deposit, fee, netInvested);
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: deposit,
        currency: 'USDT',
        network,
        purpose: 'investor_enrollment',
        gatewayId: `pending_${Date.now()}`,
        gatewayResponse: {
          investmentAmount: deposit,
          feeUsdt: fee,
          netInvested,
        } as object,
      },
    });

    if (!this.nowPayments.isConfigured) {
      throw new ServiceUnavailableException(
        'Crypto payments are not configured — contact support',
      );
    }

    try {
      const npPayment = await this.nowPayments.createPayment({
        amount: deposit,
        orderId: payment.id,
        network,
        description: `TraderRank invest $${deposit} (fee $${fee} → net $${netInvested})`,
        ipnCallbackUrl: this.ipnUrl(),
      });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayId: String(npPayment.payment_id),
          gatewayResponse: {
            ...(npPayment as object),
            investmentAmount: deposit,
            feeUsdt: fee,
            netInvested,
          } as object,
          payAddress: npPayment.pay_address,
          payAmount: npPayment.pay_amount,
        },
      });

      return {
        paymentId: payment.id,
        amount: deposit,
        investmentAmount: deposit,
        feeUsdt: fee,
        netInvested,
        currency: 'USDT',
        network,
        purpose: 'investor_enrollment',
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
        throw new BadRequestException(
          err.message || 'Could not create enrollment payment',
        );
      }
      throw err;
    }
  }

  private async payEnrollmentFromWallet(
    userId: string,
    deposit: number,
    fee: number,
    netInvested: number,
    opts?: { suppressNotification?: boolean },
  ) {
    const wallet = await this.walletService.getOrCreateWallet(userId);
    const balance = Number(wallet.availableBalance);
    if (balance < deposit) {
      throw new BadRequestException(
        `Insufficient wallet balance — need $${deposit.toFixed(2)} USDT (fee $${fee.toFixed(2)} deducted → $${netInvested.toFixed(2)} invested) but have $${balance.toFixed(2)}`,
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: deposit,
        currency: 'USDT',
        network: 'WALLET',
        purpose: 'investor_enrollment',
        gatewayId: `wallet_${Date.now()}`,
        gatewayResponse: {
          paymentSource: 'wallet',
          investmentAmount: deposit,
          feeUsdt: fee,
          netInvested,
        } as object,
      },
    });

    await this.walletService.debitBalance(
      userId,
      fee,
      'INVESTOR_FEE',
      `Investor subscription fee — $${fee.toFixed(2)} USDT deducted from $${deposit.toFixed(2)} deposit`,
      payment.id,
    );

    await this.confirmEnrollment(
      payment.id,
      {
        paymentSource: 'wallet',
        investmentAmount: deposit,
        feeUsdt: fee,
        netInvested,
      },
      { suppressNotification: opts?.suppressNotification },
    );

    await this.transferInvestment(userId, netInvested, 'to_investment');

    return {
      success: true,
      active: true,
      paymentId: payment.id,
      amount: deposit,
      feeUsdt: fee,
      investmentAmount: deposit,
      netInvested,
      currency: 'USDT',
      network: 'WALLET',
      source: 'wallet',
      message: `Paid $${deposit.toFixed(2)} — $${fee.toFixed(2)} fee deducted, $${netInvested.toFixed(2)} invested`,
      balanceAfter: balance - deposit,
    };
  }

  /**
   * Admin enrollment: charge the user's wallet (normal fee split) or grant a
   * complimentary enrollment with the full amount invested and $0 fee.
   */
  async adminEnroll(
    userId: string,
    investmentAmountRaw: number,
    source: 'wallet' | 'comp',
    opts?: { adminId?: string; note?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.investorActive) {
      throw new BadRequestException('User is already enrolled as an investor');
    }

    if (source === 'wallet') {
      const { deposit, fee, netInvested } = this.splitDeposit(investmentAmountRaw);
      const result = await this.payEnrollmentFromWallet(
        userId,
        deposit,
        fee,
        netInvested,
        { suppressNotification: true },
      );
      this.notifications.investorAdminEnrolled(userId, {
        investmentAmount: deposit,
        feeUsdt: fee,
        netInvested,
        source: 'wallet',
        note: opts?.note,
      });
      return {
        ...result,
        source: 'wallet' as const,
        adminId: opts?.adminId ?? null,
        note: opts?.note ?? null,
      };
    }

    const deposit = this.normalizeInvestmentAmount(investmentAmountRaw);
    const fee = 0;
    const netInvested = deposit;
    const note =
      opts?.note?.trim() ||
      `Admin complimentary investor enrollment — $${deposit.toFixed(2)} USDT invested`;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: deposit,
        currency: 'USDT',
        network: 'ADMIN',
        purpose: 'investor_enrollment',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        gatewayId: `admin_${opts?.adminId ?? 'system'}_${Date.now()}`,
        gatewayResponse: {
          paymentSource: 'admin_comp',
          adminId: opts?.adminId ?? null,
          investmentAmount: deposit,
          feeUsdt: fee,
          netInvested,
          note,
        } as object,
      },
    });

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          investorActive: true,
          investorEnrolledAt: now,
        },
      }),
      this.prisma.investorSettings.upsert({
        where: { userId },
        create: {
          userId,
          riskPercent: 2,
          committedInvestmentAmount: netInvested,
        },
        update: {
          committedInvestmentAmount: netInvested,
        },
      }),
    ]);

    await this.walletService.creditBalance(
      userId,
      deposit,
      'DEPOSIT',
      note,
      payment.id,
    );
    await this.transferInvestment(userId, netInvested, 'to_investment', {
      adminId: opts?.adminId,
    });

    this.notifications.investorAdminEnrolled(userId, {
      investmentAmount: deposit,
      feeUsdt: fee,
      netInvested,
      source: 'comp',
      note: opts?.note ?? note,
    });

    const wallet = await this.walletService.getOrCreateWallet(userId);

    return {
      success: true,
      active: true,
      paymentId: payment.id,
      amount: deposit,
      feeUsdt: fee,
      investmentAmount: deposit,
      netInvested,
      currency: 'USDT',
      network: 'ADMIN',
      source: 'comp' as const,
      message: `Complimentary enrollment — $${deposit.toFixed(2)} USDT invested (fee waived)`,
      walletBalance: Number(wallet.availableBalance),
      investmentBalance: Number(wallet.investorBalance ?? 0),
      adminId: opts?.adminId ?? null,
      note,
    };
  }

  async confirmEnrollment(
    paymentId: string,
    gatewayPayload: object,
    opts?: { gatewayId?: string; txHash?: string; suppressNotification?: boolean },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.status === 'CONFIRMED') {
      return { alreadyConfirmed: true };
    }

    const payload = {
      ...(typeof payment.gatewayResponse === 'object' &&
      payment.gatewayResponse != null
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {}),
      ...(gatewayPayload as Record<string, unknown>),
    };

    const depositRaw = Number(
      payload.investmentAmount ?? Number(payment.amount),
    );
    const feeRaw = Number(payload.feeUsdt);
    let fee =
      Number.isFinite(feeRaw) && feeRaw > 0
        ? Math.round(feeRaw * 100) / 100
        : null;
    let deposit: number | null = null;
    let netInvested: number | null = null;

    if (Number.isFinite(depositRaw) && depositRaw > 0) {
      try {
        const split = this.splitDeposit(depositRaw);
        deposit = split.deposit;
        fee = fee ?? split.fee;
        const netRaw = Number(payload.netInvested);
        netInvested =
          Number.isFinite(netRaw) && netRaw > 0
            ? Math.round(netRaw * 100) / 100
            : split.netInvested;
      } catch {
        deposit = null;
        netInvested = null;
      }
    }

    const committedAmount = netInvested;

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: now,
          gatewayResponse: {
            ...payload,
            ...(deposit != null ? { investmentAmount: deposit } : {}),
            ...(fee != null ? { feeUsdt: fee } : {}),
            ...(netInvested != null ? { netInvested } : {}),
          } as object,
          ...(opts?.gatewayId ? { gatewayId: opts.gatewayId } : {}),
          ...(opts?.txHash ? { txHash: opts.txHash } : {}),
        },
      }),
      this.prisma.user.update({
        where: { id: payment.userId },
        data: {
          investorActive: true,
          investorEnrolledAt: now,
        },
      }),
      this.prisma.investorSettings.upsert({
        where: { userId: payment.userId },
        create: {
          userId: payment.userId,
          riskPercent: 2,
          ...(committedAmount != null
            ? { committedInvestmentAmount: committedAmount }
            : {}),
        },
        update: {
          ...(committedAmount != null
            ? { committedInvestmentAmount: committedAmount }
            : {}),
        },
      }),
    ]);

    // Crypto: credit full deposit, deduct fee, allocate net to investment.
    if (payment.network !== 'WALLET' && deposit != null && fee != null && netInvested != null) {
      await this.walletService.creditBalance(
        payment.userId,
        deposit,
        'DEPOSIT',
        `Investor deposit — $${deposit.toFixed(2)} USDT`,
        paymentId,
      );
      await this.walletService.debitBalance(
        payment.userId,
        fee,
        'INVESTOR_FEE',
        `Investor subscription fee — $${fee.toFixed(2)} USDT deducted from deposit`,
        paymentId,
      );
      await this.transferInvestment(
        payment.userId,
        netInvested,
        'to_investment',
      );
    }

    if (!opts?.suppressNotification) {
      this.notifications.investorEnrollmentConfirmed(payment.userId, {
        amount: fee ?? Number(payment.amount),
      });
    }

    return {
      confirmed: true,
      userId: payment.userId,
      investmentAmount: deposit,
      feeUsdt: fee,
      netInvested: committedAmount,
    };
  }

  async updateSettings(userId: string, riskPercent: number) {
    if (!Number.isFinite(riskPercent) || riskPercent < 0.5 || riskPercent > 10) {
      throw new BadRequestException('Risk must be between 0.5% and 10%');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.investorActive) {
      throw new BadRequestException('Enroll in the investor program first');
    }

    const settings = await this.prisma.investorSettings.upsert({
      where: { userId },
      create: { userId, riskPercent },
      update: { riskPercent },
    });

    this.notifications.investorRiskUpdated(userId, { riskPercent });

    return {
      riskPercent: Number(settings.riskPercent),
      useTwoToOneRr: settings.useTwoToOneRr,
      paused: settings.paused,
    };
  }

  async setPaused(userId: string, paused: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.investorActive) {
      throw new BadRequestException('Enroll in the investor program first');
    }

    await this.prisma.investorSettings.upsert({
      where: { userId },
      create: { userId, paused },
      update: { paused },
    });

    if (paused) {
      this.notifications.investorPaused(userId);
    } else {
      this.notifications.investorResumed(userId);
    }

    return { paused };
  }

  async setYieldPaused(userId: string, yieldPaused: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.investorActive) {
      throw new BadRequestException('Enroll in the investor program first');
    }

    const settings = await this.prisma.investorSettings.upsert({
      where: { userId },
      create: { userId, yieldPaused },
      update: { yieldPaused },
    });

    return { yieldPaused: settings.yieldPaused };
  }

  /**
   * Move funds between liquid wallet and investment balance.
   * direction: to_investment = wallet → investment, to_wallet = investment → wallet
   */
  async transferInvestment(
    userId: string,
    amount: number,
    direction: 'to_investment' | 'to_wallet',
    opts?: { adminId?: string },
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    const rounded = Math.round(amount * 100) / 100;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.investorActive) {
      throw new BadRequestException('User must be enrolled in the investor program');
    }

    const wallet = await this.walletService.getOrCreateWallet(userId);
    const available = Number(wallet.availableBalance);
    const invested = Number(wallet.investorBalance ?? 0);

    if (direction === 'to_investment') {
      if (available < rounded) {
        throw new BadRequestException(
          `Insufficient wallet balance — need $${rounded.toFixed(2)} but have $${available.toFixed(2)}`,
        );
      }
      const nextAvailable = available - rounded;
      const nextInvested = invested + rounded;
      await this.prisma.$transaction([
        this.prisma.platformWallet.update({
          where: { userId },
          data: {
            availableBalance: nextAvailable,
            investorBalance: nextInvested,
          },
        }),
        this.prisma.walletTransaction.create({
          data: {
            userId,
            amount: -rounded,
            type: 'INVESTOR_ALLOCATE',
            referenceId: opts?.adminId ? `admin_${opts.adminId}` : userId,
            description: opts?.adminId
              ? `Admin moved $${rounded.toFixed(2)} USDT from wallet to investment`
              : `Moved $${rounded.toFixed(2)} USDT from wallet to investment`,
            balanceAfter: nextAvailable,
          },
        }),
      ]);
      return {
        direction,
        amount: rounded,
        walletBalance: nextAvailable,
        investmentBalance: nextInvested,
      };
    }

    if (invested < rounded) {
      throw new BadRequestException(
        `Insufficient investment balance — need $${rounded.toFixed(2)} but have $${invested.toFixed(2)}`,
      );
    }
    const nextAvailable = available + rounded;
    const nextInvested = invested - rounded;
    await this.prisma.$transaction([
      this.prisma.platformWallet.update({
        where: { userId },
        data: {
          availableBalance: nextAvailable,
          investorBalance: nextInvested,
        },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          amount: rounded,
          type: 'INVESTOR_REDEEM',
          referenceId: opts?.adminId ? `admin_${opts.adminId}` : userId,
          description: opts?.adminId
            ? `Admin moved $${rounded.toFixed(2)} USDT from investment to wallet`
            : `Moved $${rounded.toFixed(2)} USDT from investment to wallet`,
          balanceAfter: nextAvailable,
        },
      }),
    ]);
    return {
      direction,
      amount: rounded,
      walletBalance: nextAvailable,
      investmentBalance: nextInvested,
    };
  }

  /** Calendar date in Africa/Kampala (platform local time). */
  private kampalaToday() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kampala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(new Date());
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    const m = Number(parts.find((p) => p.type === 'month')?.value);
    const d = Number(parts.find((p) => p.type === 'day')?.value);
    return new Date(Date.UTC(y, m - 1, d));
  }

  /** 0 = Sunday … 6 = Saturday in Africa/Kampala. */
  private kampalaDayOfWeek(date: Date): number {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Kampala',
      weekday: 'short',
    });
    const day = fmt.format(date);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[day] ?? date.getUTCDay();
  }

  async getVipStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        investorActive: true,
        investorVipActive: true,
        investorVipExpiresAt: true,
        platformWallet: { select: { availableBalance: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const active = isInvestorVipActive(user);
    return {
      eligible: user.investorActive,
      active,
      expiresAt: user.investorVipExpiresAt?.toISOString() ?? null,
      feeUsdt: INVESTOR_VIP_FEE_USDT,
      walletBalance: Number(user.platformWallet?.availableBalance ?? 0),
      benefits: {
        weekendEarnings: true,
        zeroWithdrawalFee: true,
      },
    };
  }

  async upgradeVip(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        investorActive: true,
        investorVipActive: true,
        investorVipExpiresAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.investorActive) {
      throw new BadRequestException(
        'Enroll in the investor program before upgrading to VIP',
      );
    }

    const fee = INVESTOR_VIP_FEE_USDT;
    const wallet = await this.walletService.getOrCreateWallet(userId);
    const balance = Number(wallet.availableBalance);
    if (balance < fee) {
      throw new BadRequestException(
        `Insufficient wallet balance — need $${fee.toFixed(2)} USDT for VIP but have $${balance.toFixed(2)}`,
      );
    }

    const expiresAt = nextVipExpiry(user.investorVipExpiresAt);
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: fee,
        currency: 'USDT',
        network: 'WALLET',
        purpose: 'investor_vip',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        gatewayId: `vip_wallet_${Date.now()}`,
        gatewayResponse: {
          paymentSource: 'wallet',
          expiresAt: expiresAt.toISOString(),
          months: 1,
        } as object,
      },
    });

    await this.walletService.debitBalance(
      userId,
      fee,
      'SUBSCRIPTION',
      `Investor VIP — $${fee.toFixed(2)} USDT / 30 days`,
      payment.id,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        investorVipActive: true,
        investorVipExpiresAt: expiresAt,
        investorVipRemindedAt: null,
      },
    });

    this.notifications.investorVipActivated(userId, {
      feeUsdt: fee,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      success: true,
      active: true,
      feeUsdt: fee,
      expiresAt: expiresAt.toISOString(),
      paymentId: payment.id,
      message: `VIP active until ${expiresAt.toISOString().slice(0, 10)}`,
    };
  }

  /** Clear expired VIP flags and send renewal reminders (~3 days before). */
  async maintainVipSubscriptions() {
    const now = new Date();
    const expired = await this.prisma.user.updateMany({
      where: {
        investorVipActive: true,
        OR: [
          { investorVipExpiresAt: null },
          { investorVipExpiresAt: { lt: now } },
        ],
      },
      data: { investorVipActive: false },
    });

    const reminderBefore = new Date(
      now.getTime() + INVESTOR_VIP_REMINDER_DAYS * 24 * 60 * 60 * 1000,
    );
    const reminderAfter = now;
    const candidates = await this.prisma.user.findMany({
      where: {
        investorVipActive: true,
        investorVipExpiresAt: {
          gt: reminderAfter,
          lte: reminderBefore,
        },
        OR: [
          { investorVipRemindedAt: null },
          {
            investorVipRemindedAt: {
              lt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
      select: {
        id: true,
        investorVipExpiresAt: true,
      },
      take: 200,
    });

    let reminded = 0;
    for (const user of candidates) {
      if (!user.investorVipExpiresAt) continue;
      this.notifications.investorVipExpiring(user.id, {
        expiresAt: user.investorVipExpiresAt.toISOString(),
        feeUsdt: INVESTOR_VIP_FEE_USDT,
      });
      await this.prisma.user.update({
        where: { id: user.id },
        data: { investorVipRemindedAt: now },
      });
      reminded++;
    }

    return { expired: expired.count, reminded };
  }

  async platformInvestorDailyYield() {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return Number(config?.investorDailyYieldPercent ?? 8);
  }

  async isGlobalInvestorYieldPaused() {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return Boolean(config?.investorYieldPaused);
  }

  async creditDailyEarnings() {
    if (await this.isGlobalInvestorYieldPaused()) {
      this.logger.warn('Investor daily yield skipped — paused globally by admin');
      return { credited: 0, skipped: 'global_pause' as const };
    }

    const today = this.kampalaToday();
    const dow = this.kampalaDayOfWeek(today);
    const isWeekend = dow === 0 || dow === 6;
    const platformYield = await this.platformInvestorDailyYield();

    const investors = await this.prisma.user.findMany({
      where: { investorActive: true },
      include: { investorSettings: true, platformWallet: true },
    });

    let credited = 0;
    let pausedUsers = 0;
    let weekendSkipped = 0;
    for (const user of investors) {
      if (user.investorSettings?.yieldPaused) {
        pausedUsers++;
        continue;
      }

      if (isWeekend && !isInvestorVipActive(user)) {
        weekendSkipped++;
        continue;
      }

      const existing = await this.prisma.investorDailyCredit.findUnique({
        where: {
          userId_creditDate: { userId: user.id, creditDate: today },
        },
      });
      if (existing) continue;

      const yieldPercent =
        user.investorSettings?.dailyYieldPercent != null
          ? Number(user.investorSettings.dailyYieldPercent)
          : platformYield;

      const baseBalance = Number(user.platformWallet?.investorBalance ?? 0);
      if (baseBalance <= 0 || yieldPercent <= 0) continue;

      const earningAmount =
        Math.round(((baseBalance * yieldPercent) / 100) * 100) / 100;
      if (earningAmount <= 0) continue;

      const wallet = await this.walletService.getOrCreateWallet(user.id);
      const newWalletBalance = Number(wallet.availableBalance) + earningAmount;
      const investmentBalance = Number(wallet.investorBalance ?? 0);

      await this.prisma.$transaction([
        this.prisma.investorDailyCredit.create({
          data: {
            userId: user.id,
            amount: earningAmount,
            yieldPercent,
            baseBalance,
            creditDate: today,
          },
        }),
        this.prisma.platformWallet.update({
          where: { userId: user.id },
          data: { availableBalance: newWalletBalance },
        }),
        this.prisma.walletTransaction.create({
          data: {
            userId: user.id,
            amount: earningAmount,
            type: 'INVESTOR_EARNING',
            referenceId: user.id,
            description: `Investor daily earning ${yieldPercent}% on $${baseBalance.toFixed(2)} investment — $${earningAmount.toFixed(2)} USDT${isWeekend ? ' (VIP weekend)' : ''}`,
            balanceAfter: newWalletBalance,
          },
        }),
      ]);

      this.notifications.investorDailyEarning(user.id, {
        amount: earningAmount,
        yieldPercent,
        balance: newWalletBalance,
        investmentBalance,
        baseBalance,
      });
      credited++;
    }

    return { credited, pausedUsers, weekendSkipped };
  }

  /** Enrollment + wallet deposits for MT5 investor display. */
  async getMt5InvestmentSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        investorActive: true,
        metaApiAccountId: true,
        platformWallet: {
          select: { availableBalance: true, investorBalance: true },
        },
      },
    });
    if (!user?.investorActive) return null;

    const financials = await this.getInvestorFinancials(userId, user);
    return financials;
  }
}
