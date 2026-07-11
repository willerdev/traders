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
import { PrismaService } from '../prisma/prisma.service';
import { FLW_GATEWAY } from './flutterwave.constants';
import { FlutterwaveApiError, FlutterwaveService } from './flutterwave.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';
import { isPublicHttpsUrl } from '../common/public-url.util';
import { resolvePublicAppUrl } from '../common/public-app-url.util';

export type MomoPaymentInput = {
  phoneNumber: string;
  network: string;
  countryCode?: string;
};

@Injectable()
export class FlutterwavePaymentsService {
  private readonly logger = new Logger(FlutterwavePaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private flw: FlutterwaveService,
    private config: ConfigService,
    @Inject(forwardRef(() => PaymentsService))
    private payments: PaymentsService,
    @Inject(forwardRef(() => WalletService))
    private wallet: WalletService,
  ) {}

  assertConfigured() {
    if (!this.flw.isConfigured) {
      throw new ServiceUnavailableException(
        'Mobile Money payments are not configured — contact support',
      );
    }
  }

  getPublicConfig() {
    return {
      ...this.flw.publicConfig,
      webhookUrl: this.webhookUrl(),
    };
  }

  getWebhookInfo() {
    const url = this.webhookUrl();
    return {
      webhookUrl: url,
      method: 'POST',
      signatureHeader: 'flutterwave-signature',
      signatureConfigured: Boolean(this.flw.webhookSecret()),
      supportedEvents: this.flw.webhookEvents(),
      dashboardHint:
        'In Flutterwave Settings → Webhooks, paste webhookUrl and set the same value as FLW_WEBHOOK_SECRET on the API server.',
    };
  }

  /** Public HTTPS webhook base — thetradeguard.com (proxied to Nest API). */
  private webhookBaseUrl(): string {
    return resolvePublicAppUrl({
      PUBLIC_APP_URL: this.config.get<string>('PUBLIC_APP_URL'),
      FRONTEND_URL: this.config.get<string>('FRONTEND_URL'),
    });
  }

  webhookUrl(): string | undefined {
    const url = `${this.webhookBaseUrl()}/api/v1/flutterwave/webhook`;
    if (process.env.NODE_ENV === 'production' && !isPublicHttpsUrl(url)) {
      return undefined;
    }
    return url;
  }

  private redirectUrl() {
    const base = this.webhookBaseUrl();
    return `${base}/wallet?momo=1`;
  }

  normalizePhone(phone: string, countryCode: string): string {
    const digits = phone.replace(/\D/g, '');
    const cc = countryCode.replace(/\D/g, '');
    if (digits.startsWith(cc)) {
      return digits.slice(cc.length);
    }
    if (digits.startsWith('0')) {
      return digits.slice(1);
    }
    return digits;
  }

  validateMomoInput(input: MomoPaymentInput) {
    const network = input.network.trim().toUpperCase();
    if (!['MTN', 'AIRTEL'].includes(network)) {
      throw new BadRequestException('Choose MTN or AIRTEL for Mobile Money');
    }
    const countryCode = (input.countryCode || this.flw.countryCode()).trim();
    const phone = this.normalizePhone(input.phoneNumber, countryCode);
    if (phone.length < 8 || phone.length > 12) {
      throw new BadRequestException('Enter a valid mobile money phone number');
    }
    return { network, countryCode, phoneNumber: phone };
  }

  async initiatePayment(input: {
    userId: string;
    purpose: string;
    amountUsd: number;
    momo: MomoPaymentInput;
    network?: string;
    currency?: string;
    gatewayMeta?: Record<string, unknown>;
  }) {
    this.assertConfigured();

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, displayName: true },
    });
    if (!user?.email?.trim()) {
      throw new BadRequestException('Add an email to your account before paying with MoMo');
    }

    const momo = this.validateMomoInput(input.momo);
    const amountUsd = Math.round(input.amountUsd * 100) / 100;
    if (amountUsd <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const localCurrency = input.currency?.trim().toUpperCase() || this.flw.localCurrency();
    const amountLocal = this.flw.usdToLocalAmount(amountUsd);

    const payment = await this.prisma.payment.create({
      data: {
        userId: input.userId,
        amount: amountUsd,
        currency: 'USDT',
        network: input.network ?? 'MOMO',
        purpose: input.purpose,
        gatewayId: `pending_${Date.now()}`,
        gatewayResponse: {
          gateway: FLW_GATEWAY,
          momoNetwork: momo.network,
          momoPhone: momo.phoneNumber,
          momoCountryCode: momo.countryCode,
          amountLocal,
          localCurrency,
          usdRate: this.flw.usdToLocalRate(),
          ...(input.gatewayMeta ?? {}),
        } as object,
      },
    });

    try {
      const display = user.displayName?.trim() || 'Trader';
      const nameParts = display.split(/\s+/);
      const charge = await this.flw.createDirectMomoCharge({
        reference: payment.id,
        amountLocal,
        currency: localCurrency,
        momo: {
          country_code: momo.countryCode,
          network: momo.network,
          phone_number: momo.phoneNumber,
        },
        customer: {
          email: user.email.trim(),
          name: {
            first: nameParts[0] || 'Trader',
            last: nameParts.slice(1).join(' ') || 'User',
          },
          phone: {
            country_code: momo.countryCode,
            number: momo.phoneNumber,
          },
        },
        redirectUrl: this.redirectUrl(),
        meta: { paymentId: payment.id, purpose: input.purpose },
      });

      const chargeData = charge.data;
      const nextAction = chargeData.next_action;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayId: chargeData.id,
          gatewayResponse: {
            gateway: FLW_GATEWAY,
            momoNetwork: momo.network,
            momoPhone: momo.phoneNumber,
            momoCountryCode: momo.countryCode,
            amountLocal,
            localCurrency,
            usdRate: this.flw.usdToLocalRate(),
            charge: chargeData,
            ...(input.gatewayMeta ?? {}),
          } as object,
        },
      });

      return {
        paymentId: payment.id,
        amount: amountUsd,
        amountLocal,
        localCurrency,
        currency: 'USDT',
        network: 'MOMO',
        purpose: input.purpose,
        gateway: FLW_GATEWAY,
        gatewayChargeId: chargeData.id,
        status: chargeData.status,
        momoNetwork: momo.network,
        momoPhone: momo.phoneNumber,
        instruction:
          nextAction?.payment_instruction?.message ??
          'Check your phone and approve the Mobile Money prompt with your PIN.',
        redirectUrl: nextAction?.redirect_url?.url,
      };
    } catch (err) {
      await this.prisma.payment
        .delete({ where: { id: payment.id } })
        .catch(() => undefined);

      if (err instanceof FlutterwaveApiError) {
        throw new BadRequestException(err.message || 'Could not start MoMo payment');
      }
      throw err;
    }
  }

  async syncPaymentById(paymentId: string, userId?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: userId ? { id: paymentId, userId } : { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const stored = (payment.gatewayResponse ?? {}) as Record<string, unknown>;
    if (stored.gateway !== FLW_GATEWAY || !payment.gatewayId) {
      return { payment, synced: false };
    }

    if (payment.status === 'CONFIRMED') {
      return { payment, synced: true, confirmed: true };
    }

    try {
      const live = await this.flw.getCharge(payment.gatewayId);
      const status = live.data?.status;

      if (this.flw.isChargeSucceeded(status)) {
        await this.payments.confirmFlutterwavePayment(payment.id, live.data as object, {
          gatewayId: live.data.id,
        });
        const updated = await this.prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        return { payment: updated, synced: true, confirmed: true };
      }

      if (this.flw.isChargeFailed(status)) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            gatewayResponse: { ...stored, charge: live.data } as object,
          },
        });
        const updated = await this.prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        return { payment: updated, synced: true, confirmed: false };
      }

      return { payment, synced: true, liveStatus: status };
    } catch (err) {
      this.logger.warn(
        `Flutterwave sync failed for ${paymentId}: ${err instanceof Error ? err.message : err}`,
      );
      return { payment, synced: false };
    }
  }

  async handleWebhook(payload: {
    id?: string;
    type?: string;
    timestamp?: number;
    data?: {
      id?: string;
      status?: string;
      reference?: string;
      amount?: number;
      currency?: string;
    };
  }) {
    const eventType = payload.type ?? '';
    const data = payload.data;
    const webhookId = payload.id;

    this.logger.log(
      `Flutterwave webhook ${webhookId ?? 'unknown'}: ${eventType} ref=${data?.reference ?? '-'} id=${data?.id ?? '-'}`,
    );

    if (!data?.reference && !data?.id) {
      return { received: true, ignored: true, reason: 'missing_reference' };
    }

    if (eventType.startsWith('charge.') || eventType === 'charge.completed') {
      return this.handleChargeWebhook(eventType, data, payload);
    }

    if (eventType.startsWith('transfer.')) {
      return this.handleTransferWebhook(eventType, data, payload);
    }

    return { received: true, ignored: true, eventType };
  }

  private async handleChargeWebhook(
    eventType: string,
    data: {
      id?: string;
      status?: string;
      reference?: string;
      amount?: number;
      currency?: string;
    },
    payload: object,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          ...(data.reference ? [{ id: data.reference }] : []),
          ...(data.id ? [{ gatewayId: data.id }] : []),
        ],
      },
    });

    if (!payment) {
      this.logger.warn(
        `Flutterwave charge webhook: no payment for ref=${data.reference} id=${data.id}`,
      );
      return { received: true, ignored: true, reason: 'payment_not_found' };
    }

    let status = data.status;
    if (data.id && this.flw.isConfigured) {
      try {
        const live = await this.flw.getCharge(data.id);
        status = live.data?.status ?? status;
      } catch (err) {
        this.logger.warn(
          `Charge verify failed for ${data.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const stored = (payment.gatewayResponse ?? {}) as Record<string, unknown>;
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayResponse: {
          ...stored,
          lastWebhook: payload,
        } as object,
      },
    });

    if (this.flw.isChargeSucceeded(status)) {
      await this.payments.confirmFlutterwavePayment(payment.id, {
        ...(data as object),
        webhookEvent: eventType,
      }, { gatewayId: data.id });
      return { received: true, handled: true, paymentId: payment.id, status: 'confirmed' };
    }

    if (this.flw.isChargeFailed(status)) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          gatewayResponse: { ...stored, lastWebhook: payload, charge: data } as object,
        },
      });
      return { received: true, handled: true, paymentId: payment.id, status: 'failed' };
    }

    return { received: true, paymentId: payment.id, status: status ?? 'pending' };
  }

  private async handleTransferWebhook(
    eventType: string,
    data: {
      id?: string;
      status?: string;
      reference?: string;
    },
    payload: object,
  ) {
    const payout = await this.prisma.payout.findFirst({
      where: {
        OR: [
          ...(data.id ? [{ gatewayPayoutId: data.id }] : []),
          ...(data.reference ? [{ id: data.reference }] : []),
        ],
      },
    });

    if (!payout) {
      this.logger.warn(
        `Flutterwave transfer webhook: no payout for ref=${data.reference} id=${data.id}`,
      );
      return { received: true, ignored: true, reason: 'payout_not_found' };
    }

    let status = data.status;
    if (data.id && this.flw.isConfigured) {
      try {
        const live = await this.flw.getTransfer(data.id);
        status = live.data?.status ?? status;
      } catch (err) {
        this.logger.warn(
          `Transfer verify failed for ${data.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (this.flw.isTransferSucceeded(status)) {
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'PAID',
          processedAt: new Date(),
          notes: `${payout.notes ?? ''} — Flutterwave ${eventType} (${data.id})`.trim(),
        },
      });
      return { received: true, handled: true, payoutId: payout.id, status: 'paid' };
    }

    if (this.flw.isChargeFailed(status)) {
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'REJECTED',
          notes: `${payout.notes ?? ''} — Flutterwave ${eventType} failed (${data.id})`.trim(),
        },
      });
      return { received: true, handled: true, payoutId: payout.id, status: 'failed' };
    }

    return { received: true, payoutId: payout.id, status: status ?? 'pending' };
  }

  async sendMomoPayout(input: {
    payoutId: string;
    amountUsd: number;
    network: string;
    phoneNumber: string;
    recipientName: string;
  }) {
    this.assertConfigured();

    const momo = this.validateMomoInput({
      phoneNumber: input.phoneNumber,
      network: input.network.replace(/^MOMO_/, ''),
    });

    const amountLocal = this.flw.usdToLocalAmount(input.amountUsd);
    const currency = this.flw.localCurrency();
    const nameParts = input.recipientName.trim().split(/\s+/);

    const transfer = await this.flw.createDirectMomoTransfer({
      reference: input.payoutId,
      amountLocal,
      currency,
      network: momo.network,
      msisdn: momo.phoneNumber,
      recipientName: {
        first: nameParts[0] || 'Trader',
        last: nameParts.slice(1).join(' ') || 'User',
      },
      narration: `TraderRank wallet withdrawal ${input.payoutId}`,
      callbackUrl: this.webhookUrl(),
    });

    return {
      transferId: transfer.data.id,
      status: transfer.data.status,
      amountLocal,
      currency,
    };
  }
}
