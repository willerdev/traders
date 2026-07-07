import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

const NETWORK_CURRENCY: Record<string, string> = {
  TRC20: 'usdttrc20',
  BEP20: 'usdtbsc',
  ERC20: 'usdterc20',
};

export class NowPaymentsApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'NowPaymentsApiError';
  }
}

@Injectable()
export class NowPaymentsService {
  private readonly logger = new Logger(NowPaymentsService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private payoutToken: string | null = null;
  private payoutTokenExpiry = 0;

  constructor(private config: ConfigService) {
    this.apiUrl =
      this.config.get<string>('NOWPAYMENTS_API_URL') ||
      'https://api.nowpayments.io/v1';
    this.apiKey = this.config.get<string>('NOWPAYMENTS_API_KEY') || '';
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.apiUrl}${path}`, options);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Network request failed';
      this.logger.error(`NOWPayments network error ${path}: ${message}`);
      throw new NowPaymentsApiError(
        'Could not reach NOWPayments — try again in a moment',
        503,
      );
    }

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const payload = body as {
        message?: string;
        status?: boolean;
        code?: string;
      };
      const message =
        payload.message ||
        payload.code ||
        `NOWPayments request failed (${res.status})`;
      this.logger.error(`NOWPayments error ${path}: ${JSON.stringify(body)}`);
      throw new NowPaymentsApiError(message, res.status, body);
    }

    return body as T;
  }

  private normalizeAmount(amount: number): number {
    const rounded = Math.round(amount * 100) / 100;
    if (!Number.isFinite(rounded) || rounded <= 0) {
      throw new HttpException(
        'Payment amount must be greater than zero',
        HttpStatus.BAD_REQUEST,
      );
    }
    return rounded;
  }

  mapNetworkToCurrency(network: string): string {
    return NETWORK_CURRENCY[network.toUpperCase()] || 'usdttrc20';
  }

  async createPayment(params: {
    amount: number;
    orderId: string;
    network: string;
    description?: string;
    ipnCallbackUrl?: string;
  }) {
    const payCurrency = this.mapNetworkToCurrency(params.network);
    const priceAmount = this.normalizeAmount(params.amount);

    const buildPayload = (priceCurrency: string) => {
      const payload: Record<string, unknown> = {
        price_amount: priceAmount,
        price_currency: priceCurrency,
        pay_currency: payCurrency,
        order_id: params.orderId,
        order_description: params.description || 'TraderRank Pro payment',
        is_fixed_rate: false,
        is_fee_paid_by_user: false,
      };
      if (params.ipnCallbackUrl) {
        payload.ipn_callback_url = params.ipnCallbackUrl;
      }
      return payload;
    };

    const post = (priceCurrency: string) =>
      this.request<{
        payment_id: number;
        payment_status: string;
        pay_address: string;
        pay_amount: number;
        pay_currency: string;
        price_amount: number;
        price_currency: string;
        order_id: string;
        invoice_url?: string;
      }>('/payment', {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(buildPayload(priceCurrency)),
      });

    try {
      return await post('usdt');
    } catch (err) {
      if (
        err instanceof NowPaymentsApiError &&
        /currency|usdt|not allowed|invalid/i.test(err.message)
      ) {
        this.logger.warn(
          'NOWPayments rejected USDT price currency — retrying with USD',
        );
        return post('usd');
      }
      throw err;
    }
  }

  async createInvoice(params: {
    amount: number;
    orderId: string;
    network: string;
    description?: string;
    successUrl?: string;
    cancelUrl?: string;
    ipnCallbackUrl?: string;
  }) {
    const payCurrency = this.mapNetworkToCurrency(params.network);

    return this.request<{
      id: string;
      invoice_url: string;
      order_id: string;
    }>('/invoice', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        price_amount: this.normalizeAmount(params.amount),
        price_currency: 'usdt',
        pay_currency: payCurrency,
        order_id: params.orderId,
        order_description: params.description || 'TraderRank Pro payment',
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        ...(params.ipnCallbackUrl
          ? { ipn_callback_url: params.ipnCallbackUrl }
          : {}),
        is_fixed_rate: false,
      }),
    });
  }

  async getPaymentStatus(paymentId: string) {
    return this.request<{
      payment_id: number;
      payment_status: string;
      pay_address: string;
      pay_amount: number;
      actually_paid: number;
      outcome_amount: number;
    }>(`/payment/${paymentId}`, {
      headers: this.headers(),
    });
  }

  private async getPayoutAuthToken(): Promise<string> {
    if (this.payoutToken && Date.now() < this.payoutTokenExpiry) {
      return this.payoutToken;
    }

    const email = this.config.get<string>('NOWPAYMENTS_PAYOUT_EMAIL');
    const password = this.config.get<string>('NOWPAYMENTS_PAYOUT_PASSWORD');

    if (!email || !password) {
      throw new Error(
        'NOWPayments payout credentials not configured (NOWPAYMENTS_PAYOUT_EMAIL / NOWPAYMENTS_PAYOUT_PASSWORD)',
      );
    }

    const result = await this.request<{ token: string }>('/auth', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ email, password }),
    });

    this.payoutToken = result.token;
    this.payoutTokenExpiry = Date.now() + 4 * 60 * 1000;
    return result.token;
  }

  async createPayout(params: {
    address: string;
    amount: number;
    currency: string;
    ipnCallbackUrl?: string;
  }) {
    const token = await this.getPayoutAuthToken();

    return this.request<{ id: string; withdrawals: unknown[] }>('/payout', {
      method: 'POST',
      headers: this.headers({ Authorization: `Bearer ${token}` }),
      body: JSON.stringify({
        ipn_callback_url: params.ipnCallbackUrl,
        withdrawals: [
          {
            address: params.address,
            currency: params.currency,
            amount: params.amount,
            ipn_callback_url: params.ipnCallbackUrl,
          },
        ],
      }),
    });
  }

  async verifyPayout(payoutId: string, verificationCode: string) {
    const token = await this.getPayoutAuthToken();

    return this.request<{ ok?: boolean; message?: string }>(
      `/payout/${payoutId}/verify`,
      {
        method: 'POST',
        headers: this.headers({ Authorization: `Bearer ${token}` }),
        body: JSON.stringify({ verification_code: verificationCode }),
      },
    );
  }

  async getBalance() {
    return this.request<Record<string, { amount?: number; pendingAmount?: number }>>(
      '/balance',
      { headers: this.headers() },
    );
  }

  /** Sum USDT custody balances (TRC20 + BEP20 + ERC20 when present). */
  sumUsdtBalance(balances: Record<string, { amount?: number }>): number {
    const keys = ['usdttrc20', 'usdtbsc', 'usdterc20', 'usdt'];
    let total = 0;
    for (const key of keys) {
      const entry = balances[key];
      if (entry?.amount != null && Number.isFinite(entry.amount)) {
        total += entry.amount;
      }
    }
    return total;
  }

  verifyIpnSignature(payload: string, signature: string): boolean {
    const secret = this.config.get<string>('NOWPAYMENTS_IPN_SECRET');
    if (!secret) return true;

    const expected = createHmac('sha512', secret).update(payload).digest('hex');
    return expected === signature;
  }
}
