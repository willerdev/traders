import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

const NETWORK_CURRENCY: Record<string, string> = {
  TRC20: 'usdttrc20',
  BEP20: 'usdtbsc',
  ERC20: 'usdterc20',
};

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
    const res = await fetch(`${this.apiUrl}${path}`, options);
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      this.logger.error(`NOWPayments error ${path}: ${JSON.stringify(body)}`);
      throw new Error(
        (body as { message?: string }).message ||
          `NOWPayments request failed (${res.status})`,
      );
    }

    return body as T;
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

    return this.request<{
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
      body: JSON.stringify({
        price_amount: params.amount,
        price_currency: 'usd',
        pay_currency: payCurrency,
        order_id: params.orderId,
        order_description: params.description || 'TraderRank Pro payment',
        ipn_callback_url: params.ipnCallbackUrl,
        is_fixed_rate: true,
        is_fee_paid_by_user: false,
      }),
    });
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
        price_amount: params.amount,
        price_currency: 'usd',
        pay_currency: payCurrency,
        order_id: params.orderId,
        order_description: params.description || 'TraderRank Pro payment',
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        ipn_callback_url: params.ipnCallbackUrl,
        is_fixed_rate: true,
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
