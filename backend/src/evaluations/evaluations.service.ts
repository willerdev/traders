import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  EvaluationPhase,
  EvaluationStatus,
  EvaluationType,
  EvaluationVariant,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  findEvaluationPlan,
  listEvaluationPlans,
  EvaluationTypeId,
  EvaluationVariantId,
} from './evaluation-plans';
import {
  NowPaymentsApiError,
  NowPaymentsService,
} from '../payments/nowpayments.service';
import { ConfigService } from '@nestjs/config';
import {
  isPublicHttpsUrl,
  resolvePublicApiBaseUrl,
} from '../common/public-url.util';
import { MetaApiService } from '../metaapi/metaapi.service';
import { Mt5PoolService } from '../mt5-sync/mt5-pool.service';
import { AuthService } from '../auth/auth.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';
import { FlutterwavePaymentsService } from '../flutterwave/flutterwave-payments.service';

@Injectable()
export class EvaluationsService {
  private readonly logger = new Logger(EvaluationsService.name);

  constructor(
    private prisma: PrismaService,
    private nowPayments: NowPaymentsService,
    private config: ConfigService,
    private metaApi: MetaApiService,
    private mt5Pool: Mt5PoolService,
    private authService: AuthService,
    private paymentsService: PaymentsService,
    @Inject(forwardRef(() => WalletService))
    private walletService: WalletService,
    @Inject(forwardRef(() => FlutterwavePaymentsService))
    private flutterwavePayments: FlutterwavePaymentsService,
  ) {}

  listPlans() {
    return listEvaluationPlans();
  }

  private ipnUrl() {
    const base = resolvePublicApiBaseUrl(this.config);
    const url = `${base}/api/v1/payments/ipn`;
    if (process.env.NODE_ENV === 'production' && !isPublicHttpsUrl(url)) {
      return undefined;
    }
    return url;
  }

  private parseType(value: string): EvaluationType {
    const map: Record<string, EvaluationType> = {
      ZERO: EvaluationType.ZERO,
      ONE_STEP: EvaluationType.ONE_STEP,
      TWO_STEP: EvaluationType.TWO_STEP,
    };
    const parsed = map[value];
    if (!parsed) throw new BadRequestException('Invalid evaluation type');
    return parsed;
  }

  private parseVariant(value: string): EvaluationVariant {
    const map: Record<string, EvaluationVariant> = {
      STANDARD: EvaluationVariant.STANDARD,
      FLEX: EvaluationVariant.FLEX,
      PRO: EvaluationVariant.PRO,
    };
    const parsed = map[value];
    if (!parsed) throw new BadRequestException('Invalid evaluation variant');
    return parsed;
  }

  async getActiveEnrollment(userId: string) {
    const active = await this.prisma.evaluationEnrollment.findFirst({
      where: {
        userId,
        status: { in: [EvaluationStatus.ACTIVE, EvaluationStatus.PASSED] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (active) return this.serializeEnrollment(active);

    const breached = await this.prisma.evaluationEnrollment.findFirst({
      where: { userId, status: EvaluationStatus.BREACHED },
      orderBy: { breachedAt: 'desc' },
    });
    if (breached) return this.serializeEnrollment(breached);

    return null;
  }

  async getHistory(userId: string) {
    const rows = await this.prisma.evaluationEnrollment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((row) => this.serializeEnrollment(row));
  }

  async listMine(userId: string) {
    const [rows, user] = await Promise.all([
      this.prisma.evaluationEnrollment.findMany({
        where: {
          userId,
          status: {
            notIn: [EvaluationStatus.PENDING],
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { selectedEvaluationEnrollmentId: true },
      }),
    ]);

    const selectedId = user?.selectedEvaluationEnrollmentId ?? null;

    return {
      selectedEnrollmentId: selectedId,
      items: rows.map((row) => ({
        ...this.serializeEnrollment(row),
        selected: row.id === selectedId,
      })),
    };
  }

  async selectEnrollment(userId: string, enrollmentId: string) {
    const enrollment = await this.prisma.evaluationEnrollment.findFirst({
      where: { id: enrollmentId, userId },
    });
    if (!enrollment) throw new NotFoundException('Evaluation not found');

    if (enrollment.status === EvaluationStatus.PENDING) {
      throw new BadRequestException('This evaluation is not active yet');
    }

    const metaApiAccountId = enrollment.metaApiAccountId?.trim() || null;
    if (!metaApiAccountId) {
      throw new BadRequestException(
        'This evaluation does not have a trading account assigned yet',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        selectedEvaluationEnrollmentId: enrollmentId,
        metaApiAccountId,
      },
    });

    return {
      selectedEnrollmentId: enrollmentId,
      enrollment: this.serializeEnrollment(enrollment),
    };
  }

  private serializeEnrollment(row: {
    id: string;
    type: EvaluationType;
    variant: EvaluationVariant;
    planId: string;
    evaluationSize: unknown;
    feeUsdt: unknown;
    status: EvaluationStatus;
    phase: EvaluationPhase;
    maxLossPercent: unknown;
    dailyLossPercent: unknown;
    profitTargetPhase1: unknown;
    profitTargetPhase2: unknown;
    consistencyPercent: unknown;
    profitSplitLabel: string;
    startEquity: unknown;
    currentEquity: unknown;
    dayStartEquity: unknown;
    breachedAt: Date | null;
    breachReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const startEquity = row.startEquity != null ? Number(row.startEquity) : null;
    const currentEquity =
      row.currentEquity != null ? Number(row.currentEquity) : null;
    const dayStartEquity =
      row.dayStartEquity != null ? Number(row.dayStartEquity) : null;
    const maxLossPct = Number(row.maxLossPercent);
    const dailyLossPct = Number(row.dailyLossPercent);

    const maxLossFloor =
      startEquity != null ? startEquity * (1 - maxLossPct / 100) : null;
    const dailyLossFloor =
      dayStartEquity != null
        ? dayStartEquity * (1 - dailyLossPct / 100)
        : null;

    return {
      id: row.id,
      type: row.type,
      variant: row.variant,
      planId: row.planId,
      evaluationSize: Number(row.evaluationSize),
      feeUsdt: Number(row.feeUsdt),
      status: row.status,
      phase: row.phase,
      rules: {
        maxLossPercent: maxLossPct,
        dailyLossPercent: dailyLossPct,
        profitTargetPhase1:
          row.profitTargetPhase1 != null
            ? Number(row.profitTargetPhase1)
            : null,
        profitTargetPhase2:
          row.profitTargetPhase2 != null
            ? Number(row.profitTargetPhase2)
            : null,
        consistencyPercent:
          row.consistencyPercent != null
            ? Number(row.consistencyPercent)
            : null,
        profitSplitLabel: row.profitSplitLabel,
      },
      startEquity,
      currentEquity,
      dayStartEquity,
      maxLossFloor,
      dailyLossFloor,
      breachedAt: row.breachedAt?.toISOString() ?? null,
      breachReason: row.breachReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async createCheckout(
    userId: string,
    input: {
      type: string;
      variant: string;
      planId: string;
      network: string;
      source?: 'wallet' | 'crypto' | 'momo';
      momoPhone?: string;
      momoNetwork?: string;
      momoCountryCode?: string;
    },
  ) {
    const type = this.parseType(input.type);
    const variant = this.parseVariant(input.variant);
    const match = findEvaluationPlan(
      input.type as EvaluationTypeId,
      input.variant as EvaluationVariantId,
      input.planId,
    );
    if (!match) {
      throw new BadRequestException('Unknown evaluation plan');
    }

    const active = await this.prisma.evaluationEnrollment.findFirst({
      where: { userId, status: EvaluationStatus.ACTIVE },
    });
    if (active) {
      throw new BadRequestException(
        'You already have an active evaluation. Complete or breach it before starting another.',
      );
    }

    const pending = await this.prisma.evaluationEnrollment.findFirst({
      where: { userId, status: EvaluationStatus.PENDING },
      include: { user: false },
    });
    if (pending?.paymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: pending.paymentId },
      });
      if (payment && payment.status === 'PENDING') {
        throw new BadRequestException(
          'You already have a pending evaluation payment — finish or wait for it to expire.',
        );
      }
    }

    const { plan, tier } = match;
    const amount = tier.feeUsdt;

    if (input.source === 'wallet') {
      return this.payFromWallet(userId, type, variant, plan, tier, amount);
    }

    if (input.source === 'momo') {
      if (!input.momoPhone?.trim() || !input.momoNetwork?.trim()) {
        throw new BadRequestException(
          'Mobile money phone number and network are required',
        );
      }

      const enrollment = await this.prisma.evaluationEnrollment.create({
        data: {
          userId,
          type,
          variant,
          planId: tier.id,
          evaluationSize: tier.evaluationSize,
          feeUsdt: amount,
          status: EvaluationStatus.PENDING,
          maxLossPercent: plan.rules.maxLossPercent,
          dailyLossPercent: plan.rules.dailyLossPercent,
          profitTargetPhase1: plan.rules.profitTargetPhase1,
          profitTargetPhase2: plan.rules.profitTargetPhase2,
          consistencyPercent: plan.rules.consistencyPercent,
          profitSplitLabel: plan.rules.profitSplitLabel,
        },
      });

      const momoPayment = await this.flutterwavePayments.initiatePayment({
        userId,
        purpose: 'evaluation_enrollment',
        amountUsd: amount,
        network: 'MOMO',
        momo: {
          phoneNumber: input.momoPhone,
          network: input.momoNetwork,
          countryCode: input.momoCountryCode,
        },
        gatewayMeta: { enrollmentId: enrollment.id },
      });

      await this.prisma.evaluationEnrollment.update({
        where: { id: enrollment.id },
        data: { paymentId: momoPayment.paymentId },
      });

      return {
        ...momoPayment,
        enrollmentId: enrollment.id,
        planId: tier.id,
        evaluationSize: tier.evaluationSize,
      };
    }

    const enrollment = await this.prisma.evaluationEnrollment.create({
      data: {
        userId,
        type,
        variant,
        planId: tier.id,
        evaluationSize: tier.evaluationSize,
        feeUsdt: amount,
        status: EvaluationStatus.PENDING,
        maxLossPercent: plan.rules.maxLossPercent,
        dailyLossPercent: plan.rules.dailyLossPercent,
        profitTargetPhase1: plan.rules.profitTargetPhase1,
        profitTargetPhase2: plan.rules.profitTargetPhase2,
        consistencyPercent: plan.rules.consistencyPercent,
        profitSplitLabel: plan.rules.profitSplitLabel,
      },
    });

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount,
        currency: 'USDT',
        network: input.network,
        purpose: 'evaluation_enrollment',
        gatewayId: `pending_${Date.now()}`,
      },
    });

    await this.prisma.evaluationEnrollment.update({
      where: { id: enrollment.id },
      data: { paymentId: payment.id },
    });

    if (!this.nowPayments.isConfigured) {
      throw new ServiceUnavailableException(
        'Crypto payments are not configured — contact support',
      );
    }

    try {
      const npPayment = await this.nowPayments.createPayment({
        amount,
        orderId: payment.id,
        network: input.network,
        description: `Evaluation program — ${tier.evaluationSize} size`,
        ipnCallbackUrl: this.ipnUrl(),
      });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayId: String(npPayment.payment_id),
          gatewayResponse: npPayment as object,
          payAddress: npPayment.pay_address,
          payAmount: npPayment.pay_amount,
        },
      });

      return {
        enrollmentId: enrollment.id,
        paymentId: payment.id,
        amount,
        currency: 'USDT',
        network: input.network,
        purpose: 'evaluation_enrollment',
        payCurrency: npPayment.pay_currency,
        payAmount: npPayment.pay_amount,
        payAddress: npPayment.pay_address,
        gatewayPaymentId: npPayment.payment_id,
        liveStatus: npPayment.payment_status,
        gateway: 'NOWPayments',
        orderId: payment.id,
        planId: tier.id,
        evaluationSize: tier.evaluationSize,
      };
    } catch (err) {
      await this.prisma.payment.delete({ where: { id: payment.id } }).catch(() => undefined);
      await this.prisma.evaluationEnrollment
        .delete({ where: { id: enrollment.id } })
        .catch(() => undefined);
      if (err instanceof NowPaymentsApiError) {
        throw new BadRequestException(
          err.message || 'Could not create evaluation payment',
        );
      }
      throw err;
    }
  }

  private async payFromWallet(
    userId: string,
    type: EvaluationType,
    variant: EvaluationVariant,
    plan: NonNullable<ReturnType<typeof findEvaluationPlan>>['plan'],
    tier: NonNullable<ReturnType<typeof findEvaluationPlan>>['tier'],
    amount: number,
  ) {
    const wallet = await this.walletService.getOrCreateWallet(userId);
    const balance = Number(wallet.availableBalance);
    if (balance < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance — you need $${amount.toFixed(2)} USDT but have $${balance.toFixed(2)}`,
      );
    }

    const enrollment = await this.prisma.evaluationEnrollment.create({
      data: {
        userId,
        type,
        variant,
        planId: tier.id,
        evaluationSize: tier.evaluationSize,
        feeUsdt: amount,
        status: EvaluationStatus.PENDING,
        maxLossPercent: plan.rules.maxLossPercent,
        dailyLossPercent: plan.rules.dailyLossPercent,
        profitTargetPhase1: plan.rules.profitTargetPhase1,
        profitTargetPhase2: plan.rules.profitTargetPhase2,
        consistencyPercent: plan.rules.consistencyPercent,
        profitSplitLabel: plan.rules.profitSplitLabel,
      },
    });

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount,
        currency: 'USDT',
        network: 'WALLET',
        purpose: 'evaluation_enrollment',
        gatewayId: `wallet_${Date.now()}`,
        gatewayResponse: { paymentSource: 'wallet', enrollmentId: enrollment.id } as object,
      },
    });

    await this.prisma.evaluationEnrollment.update({
      where: { id: enrollment.id },
      data: { paymentId: payment.id },
    });

    await this.walletService.debitBalance(
      userId,
      amount,
      'SUBSCRIPTION',
      `Evaluation program — ${tier.evaluationSize} size`,
      payment.id,
    );

    await this.confirmEnrollment(payment.id, { paymentSource: 'wallet' });

    return {
      success: true,
      enrollmentId: enrollment.id,
      paymentId: payment.id,
      amount,
      currency: 'USDT',
      network: 'WALLET',
      source: 'wallet',
      message: 'Paid from wallet balance',
      balanceAfter: balance - amount,
      planId: tier.id,
      evaluationSize: tier.evaluationSize,
    };
  }

  async confirmEnrollment(
    paymentId: string,
    gatewayPayload: object,
    opts?: { gatewayId?: string; txHash?: string },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.purpose !== 'evaluation_enrollment') {
      return { ignored: true };
    }
    if (payment.status === 'CONFIRMED') {
      return { alreadyConfirmed: true };
    }

    const enrollment = await this.prisma.evaluationEnrollment.findFirst({
      where: { paymentId: payment.id },
    });
    if (!enrollment) {
      throw new NotFoundException('Evaluation enrollment not found for payment');
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        gatewayResponse: gatewayPayload as object,
        gatewayId: opts?.gatewayId ?? payment.gatewayId,
        txHash: opts?.txHash ?? payment.txHash,
      },
    });

    await this.activateEnrollment(enrollment.id, payment.userId);
    return { confirmed: true, enrollmentId: enrollment.id };
  }

  async activateEnrollment(enrollmentId: string, userId: string) {
    const enrollment = await this.prisma.evaluationEnrollment.findFirst({
      where: { id: enrollmentId, userId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    await this.paymentsService.grantWeeklyAccess(userId);
    await this.authService.activateAccount(userId).catch(() => undefined);

    let metaApiAccountId: string | undefined = (
      await this.prisma.user.findUnique({
        where: { id: userId },
        select: { metaApiAccountId: true },
      })
    )?.metaApiAccountId?.trim() || undefined;

    if (!metaApiAccountId) {
      const assigned = await this.mt5Pool.assignFirstAvailableAccount(userId);
      metaApiAccountId = assigned?.accountId;
    }

    let startEquity = Number(enrollment.evaluationSize);
    let currentEquity = startEquity;

    if (metaApiAccountId && this.metaApi.isConfigured) {
      try {
        const account = await this.metaApi.getAccount(metaApiAccountId);
        const info = await this.metaApi.getAccountInformation(account);
        startEquity = info.equity;
        currentEquity = info.equity;
      } catch (err) {
        this.logger.warn(
          `Could not read MT5 equity for evaluation ${enrollmentId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    const now = new Date();
    await this.prisma.evaluationEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: EvaluationStatus.ACTIVE,
        metaApiAccountId,
        startEquity,
        highWaterMark: startEquity,
        dayStartEquity: startEquity,
        dayStartedAt: now,
        currentEquity,
      },
    });

    if (metaApiAccountId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          metaApiAccountId,
          selectedEvaluationEnrollmentId: enrollmentId,
        },
      });
    }

    return this.getActiveEnrollment(userId);
  }

  async markBreached(
    enrollmentId: string,
    reason: string,
    currentEquity: number,
  ) {
    const enrollment = await this.prisma.evaluationEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
    if (!enrollment || enrollment.status !== EvaluationStatus.ACTIVE) {
      return { skipped: true };
    }

    await this.prisma.evaluationEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: EvaluationStatus.BREACHED,
        breachReason: reason,
        breachedAt: new Date(),
        currentEquity,
      },
    });

    return { breached: true, enrollmentId };
  }

  async assertEvaluationTradingAccess(userId: string) {
    const breached = await this.prisma.evaluationEnrollment.findFirst({
      where: { userId, status: EvaluationStatus.BREACHED },
      orderBy: { breachedAt: 'desc' },
    });
    const active = await this.prisma.evaluationEnrollment.findFirst({
      where: { userId, status: EvaluationStatus.ACTIVE },
    });

    if (active) return active;

    if (breached) {
      throw new BadRequestException(
        `Evaluation ended — ${breached.breachReason ?? 'risk limit reached'}. Start a new program to trade again.`,
      );
    }

    return null;
  }
}
