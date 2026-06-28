import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { NowPaymentsService } from './nowpayments.service';
import { PromoService } from './promo.service';
import { BlockchainScannerService } from './blockchain-scanner.service';
import { REGISTRATION_FEE_USDT } from '../common/constants';
import { NotificationService } from '../email/notification.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private nowPayments: NowPaymentsService,
    private promo: PromoService,
    private config: ConfigService,
    private notifications: NotificationService,
    private blockchain: BlockchainScannerService,
  ) {}

  private ipnUrl() {
    const base =
      this.config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${this.config.get('PORT') || 4000}`;
    return `${base}/api/v1/payments/ipn`;
  }

  private async registrationFee(): Promise<number> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return Number(config?.registrationFeeUsdt ?? REGISTRATION_FEE_USDT);
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

    await this.prisma.user.update({
      where: { id: userId },
      data: { registrationPaid: true },
    });

    await this.authService.activateAccount(userId);

    this.notifications.accountActivated(userId);

    return {
      success: true,
      paymentId: payment.id,
      promoCode,
      discountPercent: 100,
      amountCharged: 0,
      originalAmount,
      message: 'Promo applied — registration fee waived. Account activated.',
    };
  }

  async applyPromoCode(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.registrationPaid) {
      return { message: 'Registration already paid', alreadyPaid: true };
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
    if (user.registrationPaid) {
      return { message: 'Registration already paid' };
    }

    const fee = await this.registrationFee();

    if (promoCode?.trim()) {
      const validation = await this.promo.validate(promoCode, fee);
      if (validation.finalAmount <= 0) {
        return this.completeFreeRegistration(userId, validation.code, fee);
      }
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: fee,
        currency: 'USDT',
        network,
        purpose: 'registration',
        gatewayId: `pending_${Date.now()}`,
      },
    });

    if (!this.nowPayments.isConfigured) {
      return {
        paymentId: payment.id,
        amount: fee,
        currency: 'USDT',
        network,
        gateway: 'NOWPayments',
        message: 'NOWPayments not configured — set NOWPAYMENTS_API_KEY',
      };
    }

    const npPayment = await this.nowPayments.createPayment({
      amount: fee,
      orderId: payment.id,
      network,
      description: 'TraderRank Pro registration fee',
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
      amount: fee,
      currency: 'USDT',
      network,
      payCurrency: npPayment.pay_currency,
      payAmount: npPayment.pay_amount,
      payAddress: npPayment.pay_address,
      gatewayPaymentId: npPayment.payment_id,
      liveStatus: npPayment.payment_status,
      gateway: 'NOWPayments',
      orderId: payment.id,
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

    return { status: 'confirmed', paymentId: payment.id };
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
    payment: { id: string; userId: string; status: string },
    gatewayPayload: object,
    gatewayId?: string,
    opts?: { txHash?: string; source?: 'ipn' | 'nowpayments' | 'blockchain' },
  ) {
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
}
