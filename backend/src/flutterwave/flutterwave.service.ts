import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
import {
  FLW_DEFAULT_API_URL,
  FLW_SANDBOX_API_URL,
  FLW_TOKEN_URL,
} from './flutterwave.constants';

export class FlutterwaveApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'FlutterwaveApiError';
  }
}

type FlwCustomer = {
  email: string;
  name?: { first: string; last: string; middle?: string };
  phone?: { country_code: string; number: string };
};

type FlwMomoMethod = {
  country_code: string;
  network: string;
  phone_number: string;
};

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.clientId() && this.clientSecret());
  }

  get publicConfig() {
    return {
      enabled: this.isConfigured,
      currency: this.localCurrency(),
      countryCode: this.countryCode(),
      usdRate: this.usdToLocalRate(),
      minDepositUsd: this.minDepositUsd(),
      networks: [
        { id: 'MTN', label: 'MTN MoMo' },
        { id: 'AIRTEL', label: 'Airtel Money' },
      ],
    };
  }

  webhookEvents() {
    return [
      'charge.completed',
      'charge.failed',
      'transfer.disburse',
      'transfer.failed',
      'transfer.reversal',
    ];
  }

  private clientId(): string {
    return (this.config.get<string>('FLW_CLIENT_ID') || '').trim();
  }

  private clientSecret(): string {
    return (this.config.get<string>('FLW_CLIENT_SECRET') || '').trim();
  }

  webhookSecret(): string {
    return (this.config.get<string>('FLW_WEBHOOK_SECRET') || '').trim();
  }

  localCurrency(): string {
    return (
      this.config.get<string>('FLW_MOMO_CURRENCY') || 'UGX'
    ).trim().toUpperCase();
  }

  countryCode(): string {
    return (this.config.get<string>('FLW_MOMO_COUNTRY_CODE') || '256').trim();
  }

  usdToLocalRate(): number {
    const raw = Number(this.config.get<string>('FLW_USD_TO_LOCAL_RATE') || '3800');
    return Number.isFinite(raw) && raw > 0 ? raw : 3800;
  }

  minDepositUsd(): number {
    const raw = Number(this.config.get<string>('FLW_MIN_DEPOSIT_USD') || '5');
    return Number.isFinite(raw) && raw > 0 ? raw : 5;
  }

  usdToLocalAmount(usd: number): number {
    return Math.ceil(usd * this.usdToLocalRate());
  }

  localToUsdAmount(local: number): number {
    const rate = this.usdToLocalRate();
    return Math.round((local / rate) * 100) / 100;
  }

  private apiBaseUrl(): string {
    const override = this.config.get<string>('FLW_API_URL')?.trim();
    if (override) return override.replace(/\/$/, '');
    const env =
      this.config.get<string>('FLW_ENV') ||
      (this.config.get<string>('NODE_ENV') === 'production' ? 'live' : 'sandbox');
    return env === 'sandbox' ? FLW_SANDBOX_API_URL : FLW_DEFAULT_API_URL;
  }

  private async ensureAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const body = new URLSearchParams({
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      grant_type: 'client_credentials',
    });

    const res = await fetch(FLW_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
      error?: string;
    };

    if (!res.ok || !json.access_token) {
      throw new FlutterwaveApiError(
        json.error_description || json.error || 'Flutterwave OAuth failed',
        res.status,
        json,
      );
    }

    this.accessToken = json.access_token;
    this.tokenExpiresAt = now + (json.expires_in ?? 600) * 1000;
    return this.accessToken;
  }

  private traceHeaders(idempotencyKey?: string) {
    return {
      'X-Trace-Id': randomUUID(),
      'X-Idempotency-Key': idempotencyKey ?? randomUUID(),
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const token = await this.ensureAccessToken();
    const url = `${this.apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...this.traceHeaders(idempotencyKey),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (json as { message?: string }).message ||
        (json as { error?: string }).error ||
        `Flutterwave API error (${res.status})`;
      throw new FlutterwaveApiError(message, res.status, json);
    }

    return json as T;
  }

  async createDirectMomoCharge(input: {
    reference: string;
    amountLocal: number;
    currency: string;
    momo: FlwMomoMethod;
    customer: FlwCustomer;
    redirectUrl?: string;
    meta?: Record<string, unknown>;
  }) {
    const payload = {
      amount: input.amountLocal,
      currency: input.currency,
      reference: input.reference,
      redirect_url: input.redirectUrl,
      meta: input.meta ?? {},
      payment_method: {
        type: 'mobile_money',
        mobile_money: {
          country_code: input.momo.country_code,
          network: input.momo.network,
          phone_number: input.momo.phone_number,
        },
      },
      customer: {
        email: input.customer.email,
        name: input.customer.name ?? {
          first: 'Trader',
          last: 'Rank',
        },
        phone: input.customer.phone ?? {
          country_code: input.momo.country_code,
          number: input.momo.phone_number,
        },
      },
    };

    return this.request<{
      status: string;
      message: string;
      data: {
        id: string;
        status: string;
        reference: string;
        amount: number;
        currency: string;
        next_action?: {
          type: string;
          payment_instruction?: { message?: string };
          redirect_url?: { url?: string };
        };
      };
    }>('POST', '/orchestration/direct-charges', payload, input.reference);
  }

  async getCharge(chargeId: string) {
    return this.request<{
      status: string;
      data: {
        id: string;
        status: string;
        reference: string;
        amount: number;
        currency: string;
      };
    }>('GET', `/charges/${encodeURIComponent(chargeId)}`);
  }

  async createDirectMomoTransfer(input: {
    reference: string;
    amountLocal: number;
    currency: string;
    network: string;
    msisdn: string;
    recipientName: { first: string; last: string };
    narration: string;
    callbackUrl?: string;
  }) {
    const payload = {
      type: 'mobile_money',
      action: 'instant',
      reference: input.reference,
      narration: input.narration.slice(0, 180),
      callback_url: input.callbackUrl,
      payment_instruction: {
        destination_currency: input.currency,
        source_currency: input.currency,
        amount: { value: input.amountLocal },
        recipient: {
          type: 'mobile_money',
          name: input.recipientName,
          mobile_money: {
            network: input.network,
            msisdn: input.msisdn,
          },
        },
      },
    };

    return this.request<{
      status: string;
      message: string;
      data: {
        id: string;
        status: string;
        reference?: string;
      };
    }>('POST', '/direct-transfers', payload, input.reference);
  }

  async getTransfer(transferId: string) {
    return this.request<{
      status: string;
      data: { id: string; status: string; reference?: string };
    }>('GET', `/transfers/${encodeURIComponent(transferId)}`);
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string | undefined): boolean {
    const secret = this.webhookSecret();
    if (!secret) {
      this.logger.warn('FLW_WEBHOOK_SECRET not set — skipping signature check');
      return true;
    }
    if (!signature?.trim()) return false;

    const trimmed = signature.trim();
    // Dashboard "secret hash" mode (direct compare).
    if (trimmed === secret) return true;

    // v4 HMAC-SHA256 base64 signature.
    const hash = createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    return hash === trimmed;
  }

  isChargeSucceeded(status: string | undefined): boolean {
    const s = (status ?? '').toLowerCase();
    return s === 'succeeded' || s === 'successful' || s === 'completed';
  }

  isChargeFailed(status: string | undefined): boolean {
    const s = (status ?? '').toLowerCase();
    return s === 'failed' || s === 'cancelled' || s === 'canceled';
  }

  isTransferSucceeded(status: string | undefined): boolean {
    const s = (status ?? '').toLowerCase();
    return s === 'succeeded' || s === 'successful' || s === 'completed' || s === 'disbursed';
  }
}
