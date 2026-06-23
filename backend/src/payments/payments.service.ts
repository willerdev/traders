import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { NowPaymentsService } from './nowpayments.service';
import { PromoService } from './promo.service';
import { REGISTRATION_FEE_USDT } from '../common/constants';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private nowPayments: NowPaymentsService,
    private promo: PromoService,
    private config: ConfigService,
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
    const validation = this.promo.validate(code, fee);

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
      const validation = this.promo.validate(promoCode, fee);
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

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const invoice = await this.nowPayments.createInvoice({
      amount: fee,
      orderId: payment.id,
      network,
      description: 'TraderRank Pro registration fee',
      successUrl: `${frontendUrl}/dashboard?payment=success`,
      cancelUrl: `${frontendUrl}/register?payment=cancelled`,
      ipnCallbackUrl: this.ipnUrl(),
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayId: invoice.id,
        gatewayResponse: invoice as object,
      },
    });

    return {
      paymentId: payment.id,
      amount: fee,
      currency: 'USDT',
      network,
      payCurrency: this.nowPayments.mapNetworkToCurrency(network),
      gateway: 'NOWPayments',
      invoiceUrl: invoice.invoice_url,
      orderId: payment.id,
    };
  }

  async validatePromoCode(code: string) {
    const fee = await this.registrationFee();
    const validation = this.promo.validate(code, fee);
    return {
      valid: true,
      code: validation.code,
      discountPercent: validation.discountPercent,
      description: validation.description,
      originalAmount: validation.originalAmount,
      finalAmount: validation.finalAmount,
      freeRegistration: validation.finalAmount <= 0,
    };
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

    if (confirmed && payment.status !== 'CONFIRMED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'CONFIRMED',
          gatewayId: String(payload.payment_id ?? payment.gatewayId),
          gatewayResponse: payload as object,
          confirmedAt: new Date(),
        },
      });

      await this.prisma.user.update({
        where: { id: payment.userId },
        data: { registrationPaid: true },
      });

      await this.authService.activateAccount(payment.userId);
      return { status: 'confirmed', paymentId: payment.id };
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
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.gatewayId && this.nowPayments.isConfigured) {
      try {
        const live = await this.nowPayments.getPaymentStatus(payment.gatewayId);
        return { payment, liveStatus: live.payment_status };
      } catch {
        return { payment };
      }
    }

    return { payment };
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
