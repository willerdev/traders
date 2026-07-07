import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import {
  NowPaymentsApiError,
  NowPaymentsService,
} from './nowpayments.service';
import { PromoService } from './promo.service';
import { BlockchainScannerService } from './blockchain-scanner.service';
import { REGISTRATION_FEE_USDT } from '../common/constants';
import {
  isPublicHttpsUrl,
  resolvePublicApiBaseUrl,
} from '../common/public-url.util';
import {
  computeWeeklyAccessExpiry,
  hasActiveTradingAccess,
} from '../common/weekly-access.util';
import { NotificationService } from '../email/notification.service';
import { SubscriptionPlan } from '@prisma/client';
import { ProfitShareService } from '../profit-share/profit-share.service';
import { resolveProfitShareConfig } from '../common/profit-share.util';
import { ReferralsService } from '../referrals/referrals.service';
import { Mt5SyncBillingService } from '../mt5-sync/mt5-sync-billing.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private static readonly CREATE_COOLDOWN_MS = 15_000;
  private readonly lastGatewayCreateByUser = new Map<string, number>();
  private readonly setupPlanPrice: Record<'PREMIUM' | 'PRO', number> = {
    PREMIUM: 5,
    PRO: 15,
  };

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private nowPayments: NowPaymentsService,
    private promo: PromoService,
    private config: ConfigService,
    private notifications: NotificationService,
    private blockchain: BlockchainScannerService,
    private profitShare: ProfitShareService,
    private referrals: ReferralsService,
    private mt5SyncBilling: Mt5SyncBillingService,
  ) {}

  private ipnUrl() {
    const base = resolvePublicApiBaseUrl(this.config);
    const url = `${base}/api/v1/payments/ipn`;
    if (process.env.NODE_ENV === 'production' && !isPublicHttpsUrl(url)) {
      this.logger.warn(
        `NOWPayments IPN URL is not public HTTPS (${url}). Set API_PUBLIC_URL on Render.`,
      );
      return undefined;
    }
    return url;
  }

  private async createGatewayPayment(input: {
    paymentId: string;
    amount: number;
    network: string;
    description: string;
    promoMeta?: Record<string, unknown>;
  }) {
    if (!this.nowPayments.isConfigured) {
      throw new ServiceUnavailableException(
        'Crypto payments are not configured — contact support',
      );
    }

    try {
      const npPayment = await this.nowPayments.createPayment({
        amount: input.amount,
        orderId: input.paymentId,
        network: input.network,
        description: input.description,
        ipnCallbackUrl: this.ipnUrl(),
      });

      await this.prisma.payment.update({
        where: { id: input.paymentId },
        data: {
          gatewayId: String(npPayment.payment_id),
          gatewayResponse: {
            ...(npPayment as object),
            ...(input.promoMeta ?? {}),
          } as object,
          payAddress: npPayment.pay_address,
          payAmount: npPayment.pay_amount,
        },
      });

      return npPayment;
    } catch (err) {
      const isRateLimited =
        err instanceof NowPaymentsApiError && err.statusCode === 429;
      if (!isRateLimited) {
        await this.prisma.payment
          .delete({ where: { id: input.paymentId } })
          .catch(() => undefined);
      }

      if (err instanceof NowPaymentsApiError) {
        throw new BadRequestException(
          err.message || 'NOWPayments could not create this payment',
        );
      }
      throw err;
    }
  }

  private assertGatewayCreateCooldown(userId: string) {
    const last = this.lastGatewayCreateByUser.get(userId) ?? 0;
    const waitMs = PaymentsService.CREATE_COOLDOWN_MS - (Date.now() - last);
    if (waitMs > 0) {
      throw new BadRequestException(
        `Please wait ${Math.ceil(waitMs / 1000)} seconds before creating another payment.`,
      );
    }
    this.lastGatewayCreateByUser.set(userId, Date.now());
  }

  private formatRegistrationPaymentResponse(
    payment: {
      id: string;
      amount: { toString(): string } | number;
      network: string;
      payAddress?: string | null;
      payAmount?: { toString(): string } | number | null;
      gatewayId?: string | null;
      gatewayResponse: unknown;
    },
    extras?: {
      promoCode?: string;
      discountPercent?: number;
      originalAmount?: number;
    },
  ) {
    const stored = (payment.gatewayResponse ?? {}) as Record<string, unknown>;
    const payCurrency =
      typeof stored.pay_currency === 'string' ? stored.pay_currency : 'usdt';
    const gatewayPaymentId =
      payment.gatewayId && !payment.gatewayId.startsWith('pending_')
        ? Number(payment.gatewayId)
        : undefined;

    return {
      paymentId: payment.id,
      amount: Number(payment.amount),
      currency: 'USDT',
      network: payment.network,
      ...(extras?.promoCode
        ? {
            promoCode: extras.promoCode,
            discountPercent: extras.discountPercent,
            originalAmount: extras.originalAmount,
          }
        : {}),
      payCurrency,
      payAmount:
        payment.payAmount != null
          ? Number(payment.payAmount)
          : Number(payment.amount),
      payAddress: payment.payAddress ?? undefined,
      gatewayPaymentId,
      liveStatus:
        typeof stored.payment_status === 'string'
          ? stored.payment_status
          : 'waiting',
      gateway: 'NOWPayments',
      orderId: payment.id,
    };
  }

  private async findReusableRegistrationPayment(
    userId: string,
    network: string,
    amount: number,
  ) {
    return this.prisma.payment.findFirst({
      where: {
        userId,
        purpose: 'registration',
        status: 'PENDING',
        network,
        amount,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async registrationFee(): Promise<number> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return Number(config?.registrationFeeUsdt ?? REGISTRATION_FEE_USDT);
  }

  async grantWeeklyAccess(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const accessExpiresAt = computeWeeklyAccessExpiry(
      new Date(),
      user.accessExpiresAt,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        registrationPaid: true,
        status: 'ACTIVE',
        accessExpiresAt,
      },
    });

    // First-time subscription referral reward (idempotent).
    await this.referrals.rewardForPaidRegistration(userId).catch(() => undefined);

    return accessExpiresAt;
  }

  private needsWeeklyPayment(user: {
    registrationPaid: boolean;
    status: string;
    role: string;
    accessExpiresAt: Date | null;
  }) {
    if (user.role === 'ADMIN') return false;
    return !hasActiveTradingAccess(user);
  }

  private async completeFreeRegistration(
    userId: string,
    promoCode: string,
    originalAmount: number,
  ) {
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: 0,
        currency: 'USDT',
        network: 'PROMO',
        purpose: 'registration',
        status: 'CONFIRMED',
        gatewayId: `promo_${promoCode}`,
        gatewayResponse: {
          promoCode,
          originalAmount,
          discountPercent: 100,
        } as object,
        confirmedAt: new Date(),
      },
    });

    await this.grantWeeklyAccess(userId);
    await this.authService.activateAccount(userId);

    this.notifications.accountActivated(userId);

    return {
      success: true,
      paymentId: payment.id,
      promoCode,
      discountPercent: 100,
      amountCharged: 0,
      originalAmount,
      message: 'Promo applied — 7 days of trading access activated.',
    };
  }

  async applyPromoCode(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!this.needsWeeklyPayment(user)) {
      return {
        message: 'Weekly access is already active',
        alreadyPaid: true,
        accessExpiresAt: user.accessExpiresAt?.toISOString() ?? null,
      };
    }

    const fee = await this.registrationFee();
    const validation = await this.promo.validate(code, fee);

    if (validation.finalAmount > 0) {
      throw new BadRequestException(
        `Promo "${validation.code}" only gives ${validation.discountPercent}% off — pay the remaining $${validation.finalAmount} USDT`,
      );
    }

    return this.completeFreeRegistration(userId, validation.code, fee);
  }

  async createRegistrationPayment(
    userId: string,
    network: string,
    promoCode?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!this.needsWeeklyPayment(user)) {
      return {
        message: 'Weekly access is still active',
        accessExpiresAt: user.accessExpiresAt?.toISOString() ?? null,
      };
    }

    const fee = await this.registrationFee();

    // Partial promo codes discount the amount; 100% codes skip payment entirely.
    let amount = fee;
    let appliedPromo: {
      code: string;
      discountPercent: number;
    } | null = null;
    if (promoCode?.trim()) {
      const validation = await this.promo.validate(promoCode, fee);
      if (validation.finalAmount <= 0) {
        return this.completeFreeRegistration(userId, validation.code, fee);
      }
      amount = validation.finalAmount;
      appliedPromo = {
        code: validation.code,
        discountPercent: validation.discountPercent,
      };
    }

    const promoExtras = appliedPromo
      ? {
          promoCode: appliedPromo.code,
          discountPercent: appliedPromo.discountPercent,
          originalAmount: fee,
        }
      : undefined;
    const promoMeta = promoExtras;

    if (!this.nowPayments.isConfigured) {
      const payment = await this.prisma.payment.create({
        data: {
          userId,
          amount,
          currency: 'USDT',
          network,
          purpose: 'registration',
          gatewayId: `pending_${Date.now()}`,
          ...(promoMeta ? { gatewayResponse: promoMeta as object } : {}),
        },
      });
      return {
        paymentId: payment.id,
        amount,
        currency: 'USDT',
        network,
        gateway: 'NOWPayments',
        message: 'NOWPayments not configured — set NOWPAYMENTS_API_KEY',
      };
    }

    const existing = await this.findReusableRegistrationPayment(
      userId,
      network,
      amount,
    );

    if (
      existing?.payAddress &&
      existing.gatewayId &&
      !existing.gatewayId.startsWith('pending_')
    ) {
      return this.formatRegistrationPaymentResponse(existing, promoExtras);
    }

    let payment = existing;
    if (!payment) {
      this.assertGatewayCreateCooldown(userId);
      payment = await this.prisma.payment.create({
        data: {
          userId,
          amount,
          currency: 'USDT',
          network,
          purpose: 'registration',
          gatewayId: `pending_${Date.now()}`,
          ...(promoMeta ? { gatewayResponse: promoMeta as object } : {}),
        },
      });
    } else {
      this.assertGatewayCreateCooldown(userId);
    }

    await this.createGatewayPayment({
      paymentId: payment.id,
      amount,
      network,
      description: 'TraderRank Pro weekly trading access (7 days)',
      promoMeta,
    });

    const updated = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    return this.formatRegistrationPaymentResponse(updated, promoExtras);
  }

  async getPendingRegistrationPayment(userId: string, network?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        userId,
        purpose: 'registration',
        status: 'PENDING',
        payAddress: { not: null },
        ...(network ? { network: network.toUpperCase() } : {}),
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      !payment?.payAddress ||
      !payment.gatewayId ||
      payment.gatewayId.startsWith('pending_')
    ) {
      return { pending: null };
    }

    return {
      pending: this.formatRegistrationPaymentResponse(payment),
    };
  }

  private setupPlanPurpose(plan: 'PREMIUM' | 'PRO') {
    return `setup_plan_${plan.toLowerCase()}`;
  }

  private purposeToSetupPlan(
    purpose: string | null | undefined,
  ): 'PREMIUM' | 'PRO' | null {
    if (purpose === 'setup_plan_premium') return 'PREMIUM';
    if (purpose === 'setup_plan_pro') return 'PRO';
    return null;
  }

  private isProfitSharePurpose(purpose: string | null | undefined) {
    return purpose === 'profit_share';
  }

  private isMt5SyncPurpose(purpose: string | null | undefined) {
    return purpose === 'mt5_sync';
  }

  private async profitShareFee(): Promise<number> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return resolveProfitShareConfig(config).feeUsdt;
  }

  private async mt5SyncFee(): Promise<number> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return Number(config?.mt5SyncFeeUsdt ?? 5);
  }

  private async activateSetupPlanSubscription(
    userId: string,
    plan: 'PREMIUM' | 'PRO',
  ) {
    const existing = await this.prisma.subscription.findFirst({
      where: { userId, isActive: true },
      orderBy: { expiresAt: 'desc' },
    });

    const now = new Date();
    const base =
      existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
    const nextExpiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          plan,
          startsAt: existing.startsAt ?? now,
          expiresAt: nextExpiry,
          isActive: true,
        },
      });
      return;
    }

    await this.prisma.subscription.create({
      data: {
        userId,
        plan,
        startsAt: now,
        expiresAt: nextExpiry,
        isActive: true,
      },
    });
  }

  async createSetupPlanPayment(
    userId: string,
    network: string,
    plan: 'PREMIUM' | 'PRO',
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!hasActiveTradingAccess(user)) {
      throw new BadRequestException(
        'Complete weekly payment before buying setup plan',
      );
    }

    const amount = this.setupPlanPrice[plan];
    const purpose = this.setupPlanPurpose(plan);
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount,
        currency: 'USDT',
        network,
        purpose,
        gatewayId: `pending_${Date.now()}`,
      },
    });

    if (!this.nowPayments.isConfigured) {
      return {
        paymentId: payment.id,
        amount,
        currency: 'USDT',
        network,
        purpose,
        plan,
        message: 'NOWPayments not configured — set NOWPAYMENTS_API_KEY',
      };
    }

    const npPayment = await this.nowPayments.createPayment({
      amount,
      orderId: payment.id,
      network,
      description:
        plan === 'PRO'
          ? 'TraderRank setup plan — unlimited submissions'
          : 'TraderRank setup plan — +3 submissions/day',
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
      paymentId: payment.id,
      amount,
      currency: 'USDT',
      network,
      purpose,
      plan,
      payCurrency: npPayment.pay_currency,
      payAmount: npPayment.pay_amount,
      payAddress: npPayment.pay_address,
      gatewayPaymentId: npPayment.payment_id,
      liveStatus: npPayment.payment_status,
      gateway: 'NOWPayments',
      orderId: payment.id,
    };
  }

  async createProfitSharePayment(userId: string, network: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!hasActiveTradingAccess(user)) {
      throw new BadRequestException(
        'Complete weekly payment before enrolling in profit share',
      );
    }
    if (user.profitShareActive) {
      return {
        message: 'Profit share is already active',
        active: true,
        enrolledAt: user.profitShareEnrolledAt?.toISOString() ?? null,
      };
    }

    const amount = await this.profitShareFee();
    const purpose = 'profit_share';
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount,
        currency: 'USDT',
        network,
        purpose,
        gatewayId: `pending_${Date.now()}`,
      },
    });

    if (!this.nowPayments.isConfigured) {
      return {
        paymentId: payment.id,
        amount,
        currency: 'USDT',
        network,
        purpose,
        message: 'NOWPayments not configured — set NOWPAYMENTS_API_KEY',
      };
    }

    const npPayment = await this.nowPayments.createPayment({
      amount,
      orderId: payment.id,
      network,
      description: 'TraderRank profit share — 50% setup & copy commission',
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
      paymentId: payment.id,
      amount,
      currency: 'USDT',
      network,
      purpose,
      payCurrency: npPayment.pay_currency,
      payAmount: npPayment.pay_amount,
      payAddress: npPayment.pay_address,
      gatewayPaymentId: npPayment.payment_id,
      liveStatus: npPayment.payment_status,
      gateway: 'NOWPayments',
      orderId: payment.id,
    };
  }

  async getProfitSharePaymentStatus(userId: string) {
    const status = await this.profitShare.getStatus(userId);
    const latestPayment = await this.prisma.payment.findFirst({
      where: { userId, purpose: 'profit_share' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...status,
      latestPayment: latestPayment
        ? {
            id: latestPayment.id,
            status: latestPayment.status,
            amount: Number(latestPayment.amount),
            confirmedAt: latestPayment.confirmedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /**
   * Public: the promo currently showcased on the landing page.
   * Only partial-discount codes are featured — 100% codes are private
   * invites and must never be shown publicly. Picks the newest active,
   * non-expired code so replacing a code updates the site automatically.
   */
  async getFeaturedPromo() {
    const fee = await this.registrationFee();
    const promo = await this.prisma.promoCode.findFirst({
      where: {
        active: true,
        expiresAt: { gt: new Date() },
        discountPercent: { gt: 0, lt: 100 },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!promo) {
      return { registrationFeeUsdt: fee, promo: null };
    }

    const finalAmount =
      Math.round(fee * (1 - promo.discountPercent / 100) * 100) / 100;

    return {
      registrationFeeUsdt: fee,
      promo: {
        code: promo.code,
        discountPercent: promo.discountPercent,
        description: promo.description,
        originalAmount: fee,
        finalAmount,
        expiresAt: promo.expiresAt.toISOString(),
      },
    };
  }

  async validatePromoCode(code: string) {
    const fee = await this.registrationFee();
    const validation = await this.promo.validate(code, fee);
    return {
      valid: true,
      code: validation.code,
      discountPercent: validation.discountPercent,
      description: validation.description,
      originalAmount: validation.originalAmount,
      finalAmount: validation.finalAmount,
      freeRegistration: validation.finalAmount <= 0,
      expiresAt: validation.expiresAt,
    };
  }

  private extractPayDetails(payment: {
    payAddress?: string | null;
    payAmount?: { toString(): string } | null;
    network: string;
    amount: { toString(): string };
    gatewayResponse: unknown;
    createdAt: Date;
  }) {
    const stored = payment.gatewayResponse as Record<string, unknown> | null;
    const payAddress =
      payment.payAddress ||
      (stored?.pay_address as string | undefined) ||
      undefined;
    const payAmount =
      payment.payAmount != null
        ? Number(payment.payAmount)
        : stored?.pay_amount != null
          ? Number(stored.pay_amount)
          : Number(payment.amount);
    return { payAddress, payAmount, network: payment.network };
  }

  private isConfirmedGatewayStatus(status?: string) {
    return ['finished', 'confirmed', 'sent'].includes(
      status?.toLowerCase() || '',
    );
  }

  async confirmRegistrationPayment(
    paymentId: string,
    gatewayPayload: object,
    opts?: {
      gatewayId?: string;
      txHash?: string;
      source?: 'ipn' | 'nowpayments' | 'blockchain' | 'manual';
    },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status === 'CONFIRMED') {
      return { alreadyConfirmed: true, paymentId: payment.id };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CONFIRMED',
        gatewayId: opts?.gatewayId ?? payment.gatewayId ?? undefined,
        gatewayResponse: {
          ...(payment.gatewayResponse &&
          typeof payment.gatewayResponse === 'object'
            ? (payment.gatewayResponse as object)
            : {}),
          ...gatewayPayload,
          confirmationSource: opts?.source ?? 'nowpayments',
        },
        txHash: opts?.txHash ?? undefined,
        confirmedAt: new Date(),
      },
    });

    await this.prisma.user.update({
      where: { id: payment.userId },
      data: { registrationPaid: true },
    });

    const accessExpiresAt = await this.grantWeeklyAccess(payment.userId);
    await this.authService.activateAccount(payment.userId);

    const { network } = this.extractPayDetails(payment);
    this.notifications.paymentConfirmed(payment.userId, {
      txHash: opts?.txHash,
      amount: Number(payment.amount),
      network,
    });

    this.logger.log(
      `Registration payment ${paymentId} confirmed via ${opts?.source ?? 'nowpayments'}${opts?.txHash ? ` (tx ${opts.txHash.slice(0, 12)}…)` : ''}`,
    );

    return {
      status: 'confirmed',
      paymentId: payment.id,
      accessExpiresAt: accessExpiresAt.toISOString(),
    };
  }

  async confirmSetupPlanPayment(
    paymentId: string,
    gatewayPayload: object,
    opts?: {
      gatewayId?: string;
      txHash?: string;
      source?: 'ipn' | 'nowpayments' | 'blockchain' | 'manual';
    },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const plan = this.purposeToSetupPlan(payment.purpose);
    if (!plan) {
      throw new BadRequestException('Payment is not a setup plan purchase');
    }

    if (payment.status === 'CONFIRMED') {
      return { alreadyConfirmed: true, paymentId: payment.id, plan };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CONFIRMED',
        gatewayId: opts?.gatewayId ?? payment.gatewayId ?? undefined,
        gatewayResponse: {
          ...(payment.gatewayResponse &&
          typeof payment.gatewayResponse === 'object'
            ? (payment.gatewayResponse as object)
            : {}),
          ...gatewayPayload,
          confirmationSource: opts?.source ?? 'nowpayments',
        },
        txHash: opts?.txHash ?? undefined,
        confirmedAt: new Date(),
      },
    });

    await this.activateSetupPlanSubscription(payment.userId, plan);

    this.logger.log(
      `Setup plan ${plan} payment ${paymentId} confirmed via ${opts?.source ?? 'nowpayments'}`,
    );

    return { status: 'confirmed', paymentId: payment.id, plan };
  }

  async confirmProfitSharePayment(
    paymentId: string,
    gatewayPayload: object,
    opts?: {
      gatewayId?: string;
      txHash?: string;
      source?: 'ipn' | 'nowpayments' | 'blockchain' | 'manual';
    },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (!this.isProfitSharePurpose(payment.purpose)) {
      throw new BadRequestException('Payment is not a profit share enrollment');
    }

    if (payment.status === 'CONFIRMED') {
      return { alreadyConfirmed: true, paymentId: payment.id };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CONFIRMED',
        gatewayId: opts?.gatewayId ?? payment.gatewayId ?? undefined,
        gatewayResponse: {
          ...(payment.gatewayResponse &&
          typeof payment.gatewayResponse === 'object'
            ? (payment.gatewayResponse as object)
            : {}),
          ...gatewayPayload,
          confirmationSource: opts?.source ?? 'nowpayments',
        },
        txHash: opts?.txHash ?? undefined,
        confirmedAt: new Date(),
      },
    });

    await this.profitShare.activate(payment.userId);

    this.logger.log(
      `Profit share payment ${paymentId} confirmed via ${opts?.source ?? 'nowpayments'}`,
    );

    return { status: 'confirmed', paymentId: payment.id, profitShare: true };
  }

  async createMt5SyncPayment(userId: string, network: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!hasActiveTradingAccess(user)) {
      throw new BadRequestException(
        'Complete weekly payment before enrolling in MT5 Live Sync',
      );
    }
    if (!user.metaApiAccountId?.trim()) {
      throw new BadRequestException(
        'Link your MT5 trading account in Settings before enabling MT5 Live Sync',
      );
    }

    const amount = await this.mt5SyncFee();
    const purpose = 'mt5_sync';
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount,
        currency: 'USDT',
        network,
        purpose,
        gatewayId: `pending_${Date.now()}`,
      },
    });

    if (!this.nowPayments.isConfigured) {
      return {
        paymentId: payment.id,
        amount,
        currency: 'USDT',
        network,
        purpose,
        message: 'NOWPayments not configured — set NOWPAYMENTS_API_KEY',
      };
    }

    const npPayment = await this.nowPayments.createPayment({
      amount,
      orderId: payment.id,
      network,
      description: 'TraderRank MT5 Live Sync — weekly add-on',
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
      paymentId: payment.id,
      amount,
      currency: 'USDT',
      network,
      purpose,
      payCurrency: npPayment.pay_currency,
      payAmount: npPayment.pay_amount,
      payAddress: npPayment.pay_address,
      gatewayPaymentId: npPayment.payment_id,
      liveStatus: npPayment.payment_status,
      gateway: 'NOWPayments',
      orderId: payment.id,
    };
  }

  async getMt5SyncPaymentStatus(userId: string) {
    const status = await this.mt5SyncBilling.getStatus(userId);
    const latestPayment = await this.prisma.payment.findFirst({
      where: { userId, purpose: 'mt5_sync' },
      orderBy: { createdAt: 'desc' },
    });
    const feeUsdt = await this.mt5SyncFee();
    return {
      ...status,
      feeUsdt,
      latestPayment: latestPayment
        ? {
            id: latestPayment.id,
            status: latestPayment.status,
            amount: Number(latestPayment.amount),
            confirmedAt: latestPayment.confirmedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async confirmMt5SyncPayment(
    paymentId: string,
    gatewayPayload: object,
    opts?: {
      gatewayId?: string;
      txHash?: string;
      source?: 'ipn' | 'nowpayments' | 'blockchain' | 'manual';
    },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (!this.isMt5SyncPurpose(payment.purpose)) {
      throw new BadRequestException('Payment is not an MT5 Live Sync subscription');
    }

    if (payment.status === 'CONFIRMED') {
      return { alreadyConfirmed: true, paymentId: payment.id };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CONFIRMED',
        gatewayId: opts?.gatewayId ?? payment.gatewayId ?? undefined,
        gatewayResponse: {
          ...(payment.gatewayResponse &&
          typeof payment.gatewayResponse === 'object'
            ? (payment.gatewayResponse as object)
            : {}),
          ...gatewayPayload,
          confirmationSource: opts?.source ?? 'nowpayments',
        },
        txHash: opts?.txHash ?? undefined,
        confirmedAt: new Date(),
      },
    });

    await this.mt5SyncBilling.activate(payment.userId);

    this.logger.log(
      `MT5 Live Sync payment ${paymentId} confirmed via ${opts?.source ?? 'nowpayments'}`,
    );

    return { status: 'confirmed', paymentId: payment.id, mt5Sync: true };
  }

  async syncAllPendingRegistrationPayments() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pending = await this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        purpose: 'registration',
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    let confirmed = 0;
    let viaBlockchain = 0;

    for (const payment of pending) {
      const { payAddress } = this.extractPayDetails(payment);
      const gatewayId = payment.gatewayId;
      const hasGateway =
        gatewayId &&
        !gatewayId.startsWith('pending_') &&
        !gatewayId.startsWith('promo_');
      if (!payAddress && !hasGateway) continue;

      const result = await this.syncPendingRegistrationPayment(payment.id);
      if (result?.confirmed) {
        confirmed += 1;
        if (result.source === 'blockchain') viaBlockchain += 1;
      }
    }

    return { scanned: pending.length, confirmed, viaBlockchain };
  }

  async syncPendingRegistrationPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.status !== 'PENDING') return null;

    const { payAddress, payAmount, network } = this.extractPayDetails(payment);
    if (!payAddress) return null;

    const gatewayId = payment.gatewayId;
    const hasGateway =
      gatewayId &&
      !gatewayId.startsWith('pending_') &&
      !gatewayId.startsWith('promo_');

    if (hasGateway && this.nowPayments.isConfigured) {
      try {
        const live = await this.nowPayments.getPaymentStatus(gatewayId);
        const status = live.payment_status?.toLowerCase();

        if (this.isConfirmedGatewayStatus(status)) {
          await this.confirmRegistrationPayment(payment.id, live as object, {
            gatewayId,
            source: 'nowpayments',
          });
          return { confirmed: true, source: 'nowpayments' as const };
        }

        if (status === 'failed' || status === 'expired') {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: status === 'failed' ? 'FAILED' : 'EXPIRED',
              gatewayResponse: live as object,
            },
          });
          return { confirmed: false, source: 'nowpayments' as const };
        }

        if (!payment.payAddress && live.pay_address) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              payAddress: live.pay_address,
              payAmount: live.pay_amount,
              gatewayResponse: live as object,
            },
          });
        }
      } catch {
        /* fall through to blockchain scan */
      }
    }

    const chainMatch = await this.blockchain.findUsdtDeposit({
      network,
      payAddress,
      expectedAmount: payAmount,
      since: payment.createdAt,
    });

    if (chainMatch) {
      await this.confirmRegistrationPayment(
        payment.id,
        {
          blockchain: chainMatch,
          pay_address: payAddress,
          pay_amount: payAmount,
          actually_paid: chainMatch.amount,
        },
        {
          gatewayId: hasGateway ? gatewayId : undefined,
          txHash: chainMatch.txHash,
          source: 'blockchain',
        },
      );
      return { confirmed: true, source: 'blockchain' as const };
    }

    return { confirmed: false };
  }

  private async confirmPayment(
    payment: { id: string; userId: string; status: string; purpose?: string },
    gatewayPayload: object,
    gatewayId?: string,
    opts?: { txHash?: string; source?: 'ipn' | 'nowpayments' | 'blockchain' },
  ) {
    const setupPlan = this.purposeToSetupPlan(payment.purpose);
    if (setupPlan) {
      return this.confirmSetupPlanPayment(payment.id, gatewayPayload, {
        gatewayId,
        txHash: opts?.txHash,
        source: opts?.source ?? 'ipn',
      });
    }

    if (this.isProfitSharePurpose(payment.purpose)) {
      return this.confirmProfitSharePayment(payment.id, gatewayPayload, {
        gatewayId,
        txHash: opts?.txHash,
        source: opts?.source ?? 'ipn',
      });
    }

    if (this.isMt5SyncPurpose(payment.purpose)) {
      return this.confirmMt5SyncPayment(payment.id, gatewayPayload, {
        gatewayId,
        txHash: opts?.txHash,
        source: opts?.source ?? 'ipn',
      });
    }

    return this.confirmRegistrationPayment(payment.id, gatewayPayload, {
      gatewayId,
      txHash: opts?.txHash,
      source: opts?.source ?? 'ipn',
    });
  }

  async handleIpn(payload: {
    payment_id?: number;
    payment_status?: string;
    order_id?: string;
    pay_address?: string;
    actually_paid?: number;
    outcome_amount?: number;
  }) {
    const orderId = payload.order_id;
    if (!orderId) return { ignored: true };

    const payment = await this.prisma.payment.findUnique({
      where: { id: orderId },
    });
    if (!payment) return { ignored: true };

    const status = payload.payment_status?.toLowerCase();
    const confirmed = ['finished', 'confirmed', 'sent'].includes(status || '');

    if (confirmed) {
      return this.confirmPayment(
        payment,
        payload as object,
        String(payload.payment_id ?? payment.gatewayId),
      );
    }

    if (status === 'failed' || status === 'expired') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: status === 'failed' ? 'FAILED' : 'EXPIRED',
          gatewayResponse: payload as object,
        },
      });
    }

    return { status: payload.payment_status, paymentId: payment.id };
  }

  async getPaymentStatus(userId: string, paymentId: string) {
    let payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    let liveStatus: string | undefined;
    let actuallyPaid: number | undefined;
    let payAmount: number | undefined;
    let payAddress: string | undefined;

    const gatewayId = payment.gatewayId;
    if (
      gatewayId &&
      !gatewayId.startsWith('pending_') &&
      !gatewayId.startsWith('promo_') &&
      this.nowPayments.isConfigured
    ) {
      try {
        const live = await this.nowPayments.getPaymentStatus(gatewayId);
        liveStatus = live.payment_status;
        actuallyPaid = live.actually_paid;
        payAmount = live.pay_amount;
        payAddress = live.pay_address;

        const status = live.payment_status?.toLowerCase();
        const confirmed = ['finished', 'confirmed', 'sent'].includes(
          status || '',
        );

        if (confirmed && payment.status !== 'CONFIRMED') {
          await this.confirmPayment(payment, live as object, gatewayId, {
            source: 'nowpayments',
          });
          payment = await this.prisma.payment.findFirstOrThrow({
            where: { id: paymentId, userId },
          });
        } else if (status === 'failed' || status === 'expired') {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: status === 'failed' ? 'FAILED' : 'EXPIRED',
              gatewayResponse: live as object,
            },
          });
          payment = await this.prisma.payment.findFirstOrThrow({
            where: { id: paymentId, userId },
          });
        }
      } catch {
        /* use stored payment */
      }
    }

    const stored = payment.gatewayResponse as Record<string, unknown> | null;
    payAddress =
      payAddress || (stored?.pay_address as string | undefined);
    payAmount = payAmount ?? (stored?.pay_amount as number | undefined);

    return {
      payment,
      liveStatus,
      actuallyPaid,
      payAmount,
      payAddress,
      progress: this.mapPaymentProgress(liveStatus ?? payment.status),
      confirmed: payment.status === 'CONFIRMED',
    };
  }

  private mapPaymentProgress(status: string): string {
    const s = status.toLowerCase();
    if (['finished', 'confirmed', 'sent'].includes(s)) return 'complete';
    if (s === 'confirming') return 'confirming';
    if (s === 'partially_paid') return 'partial';
    if (s === 'failed') return 'failed';
    if (s === 'expired') return 'expired';
    if (s === 'confirmed') return 'complete';
    return 'waiting';
  }

  async getPaymentHistory(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWalletTransactions(userId: string) {
    return this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getSetupPlanStatus(userId: string) {
    const now = new Date();
    const active = await this.prisma.subscription.findFirst({
      where: {
        userId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { expiresAt: 'desc' },
    });

    const plan: SubscriptionPlan = active?.plan ?? 'FREE';
    const dailyLimit =
      plan === 'PRO' ? null : plan === 'PREMIUM' ? 5 : 2;

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const submittedToday = await this.prisma.signal.count({
      where: {
        userId,
        submittedAt: { gte: startOfDay, lt: now },
        status: { not: 'REJECTED_DUPLICATE' },
      },
    });

    return {
      plan,
      dailyLimit,
      submittedToday,
      remainingToday:
        dailyLimit == null ? null : Math.max(0, dailyLimit - submittedToday),
      isUnlimited: plan === 'PRO',
      subscriptionActive: Boolean(active),
      subscriptionExpiresAt: active?.expiresAt?.toISOString() ?? null,
      renewPricesUsdt: { PREMIUM: 5, PRO: 15 },
    };
  }
}
