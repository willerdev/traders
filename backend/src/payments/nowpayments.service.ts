import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { resolveJwtSecret } from '../config/jwt-secret';
import {
  decryptCredential,
  encryptCredential,
} from '../common/credential-crypto.util';
import { isSoloApp } from '../common/app-variant';

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

export type NowPaymentsCredsSource = 'env' | 'settings';

type NowPaymentsCredsSnapshot = {
  apiKeySet: boolean;
  publicKeySet: boolean;
  payoutEmailSet: boolean;
  payoutEmailMasked: string | null;
  payoutPasswordSet: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class NowPaymentsService {
  private readonly logger = new Logger(NowPaymentsService.name);
  private readonly apiUrl: string;
  private apiKey: string;
  private payoutToken: string | null = null;
  private payoutTokenExpiry = 0;
  private readonly statusCache = new Map<
    string,
    { at: number; data: Awaited<ReturnType<NowPaymentsService['fetchPaymentStatus']>> }
  >();
  private static readonly STATUS_TTL_MS = 45_000;
  private static readonly MAX_429_RETRIES = 3;

  private credsCache: {
    apiKey: string;
    privateApiKey: string;
    email: string;
    password: string;
    publicKey: string;
    source: NowPaymentsCredsSource;
    at: number;
  } | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.apiUrl =
      this.config.get<string>('NOWPAYMENTS_API_URL') ||
      'https://api.nowpayments.io/v1';
    this.apiKey = this.envApiKey();
    if (this.apiKey) {
      this.logger.log(
        `NOWPayments API key loaded from Render env · payout email ${
          this.envPayoutEmail() ? 'set' : 'MISSING'
        } · payout password ${this.envPayoutPassword() ? 'set' : 'MISSING'}`,
      );
    } else {
      this.logger.warn(
        'NOWPayments API key not found in env (NOWPAYMENTS_API_KEY or NOWPAYMENTS_PUBLIC_KEY)',
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async ensureConfigured(): Promise<boolean> {
    const { apiKey } = await this.resolvePayoutCreds();
    return Boolean(apiKey);
  }

  get isPayoutConfigured(): boolean {
    return (
      this.isConfigured &&
      Boolean(this.envPayoutEmail()) &&
      Boolean(this.envPayoutPassword())
    );
  }

  /** Safe diagnostics — never returns secret values. */
  async getPayoutConfigStatus() {
    const resolved = await this.resolvePayoutCreds();
    const snapshot = await this.credsSnapshot();
    const emailSet = Boolean(resolved.email);
    const passwordSet = Boolean(resolved.password);
    return {
      source: resolved.source,
      apiKeySet: Boolean(resolved.privateApiKey),
      publicKeySet: Boolean(resolved.publicKey),
      payoutEmailSet: emailSet,
      payoutEmailMasked: emailSet ? this.maskEmail(resolved.email) : null,
      payoutPasswordSet: passwordSet,
      payoutConfigured:
        Boolean(resolved.privateApiKey) && emailSet && passwordSet,
      shared: isSoloApp(),
      env: snapshot.env,
      settings: snapshot.settings,
    };
  }

  async isPayoutReady(): Promise<boolean> {
    const status = await this.getPayoutConfigStatus();
    return status.payoutConfigured;
  }

  private maskEmail(email: string) {
    const [user, domain] = email.split('@');
    if (!domain) return '••••';
    const head = user.slice(0, 2);
    return `${head}••••@${domain}`;
  }

  invalidatePayoutCredsCache() {
    this.credsCache = null;
    this.payoutToken = null;
    this.payoutTokenExpiry = 0;
  }

  async saveSharedPayoutLogin(input: {
    email: string;
    password: string;
    apiKey?: string;
    publicKey?: string;
    userId: string;
  }) {
    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();
    const apiKey = input.apiKey?.trim() ?? '';
    const publicKey = input.publicKey?.trim() ?? '';
    if (!email.includes('@') || email.length < 5) {
      throw new HttpException(
        'Enter the NOWPayments account email.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (password.length < 4) {
      throw new HttpException(
        'Enter the NOWPayments account password.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const enc = encryptCredential(password, this.cryptoSecret());
    const apiEnc = apiKey
      ? encryptCredential(apiKey, this.cryptoSecret())
      : undefined;
    const pubEnc = publicKey
      ? encryptCredential(publicKey, this.cryptoSecret())
      : undefined;
    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        nowpaymentsPayoutEmail: email,
        nowpaymentsPayoutPasswordEnc: enc,
        nowpaymentsApiKeyEnc: apiEnc,
        nowpaymentsPublicKeyEnc: pubEnc,
        nowpaymentsPayoutUpdatedAt: new Date(),
        nowpaymentsPayoutUpdatedById: input.userId,
      },
      update: {
        nowpaymentsPayoutEmail: email,
        nowpaymentsPayoutPasswordEnc: enc,
        ...(apiEnc ? { nowpaymentsApiKeyEnc: apiEnc } : {}),
        ...(pubEnc ? { nowpaymentsPublicKeyEnc: pubEnc } : {}),
        nowpaymentsPayoutUpdatedAt: new Date(),
        nowpaymentsPayoutUpdatedById: input.userId,
      },
    });
    this.invalidatePayoutCredsCache();
    return this.getPayoutConfigStatus();
  }

  async setCredsSource(source: NowPaymentsCredsSource, userId: string) {
    const normalized = this.normalizeSource(source);
    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        nowpaymentsCredsSource: normalized,
        nowpaymentsPayoutUpdatedAt: new Date(),
        nowpaymentsPayoutUpdatedById: userId,
      },
      update: {
        nowpaymentsCredsSource: normalized,
        nowpaymentsPayoutUpdatedAt: new Date(),
        nowpaymentsPayoutUpdatedById: userId,
      },
    });
    this.invalidatePayoutCredsCache();
    return this.getPayoutConfigStatus();
  }

  private cryptoSecret() {
    return resolveJwtSecret(this.config.get<string>('JWT_SECRET'));
  }

  /**
   * Read env from Nest ConfigService or process.env.
   * Accepts aliases and strips wrapping quotes (common Render paste mistake).
   */
  private envValue(...keys: string[]): string {
    for (const key of keys) {
      const raw =
        this.config.get<string>(key) ?? process.env[key] ?? '';
      const value = String(raw)
        .trim()
        .replace(/^['"]+|['"]+$/g, '')
        .trim();
      if (value) return value;
    }
    return '';
  }

  private envPayoutEmail(): string {
    return this.envValue(
      'NOWPAYMENTS_PAYOUT_EMAIL',
      'NOW_PAYMENTS_PAYOUT_EMAIL',
      'NOWPAYMENTS_EMAIL',
      'NOWPAYMENTS_LOGIN_EMAIL',
      'NOWPAYMENTS_ACCOUNT_EMAIL',
    );
  }

  private envPayoutPassword(): string {
    return this.envValue(
      'NOWPAYMENTS_PAYOUT_PASSWORD',
      'NOW_PAYMENTS_PAYOUT_PASSWORD',
      'NOWPAYMENTS_PASSWORD',
      'NOWPAYMENTS_LOGIN_PASSWORD',
      'NOWPAYMENTS_ACCOUNT_PASSWORD',
    );
  }

  /** Secret API key only — payouts reject the public key with 403. */
  private envPrivateApiKey(): string {
    return this.envValue(
      'NOWPAYMENTS_API_KEY',
      'NOW_PAYMENTS_API_KEY',
      'NOWPAYMENTS_KEY',
      'NP_API_KEY',
    );
  }

  /** API key from Render. Public key is accepted as a fallback for deposits only. */
  private envApiKey(): string {
    return this.envPrivateApiKey() || this.envPublicKey();
  }

  private envPublicKey(): string {
    return this.envValue(
      'NOWPAYMENTS_PUBLIC_KEY',
      'NOW_PAYMENTS_PUBLIC_KEY',
      'NOWPAYMENTS_PUB_KEY',
      'NP_PUBLIC_KEY',
    );
  }

  private normalizeSource(raw?: string | null): NowPaymentsCredsSource {
    return raw?.trim().toLowerCase() === 'settings' ? 'settings' : 'env';
  }

  private decryptEnc(enc?: string | null): string {
    if (!enc?.trim()) return '';
    try {
      return decryptCredential(enc, this.cryptoSecret());
    } catch {
      this.logger.warn('Could not decrypt a saved NOWPayments credential');
      return '';
    }
  }

  private async loadSettingsRow(): Promise<{
    nowpaymentsPayoutEmail: string | null;
    nowpaymentsPayoutPasswordEnc: string | null;
    nowpaymentsApiKeyEnc: string | null;
    nowpaymentsPublicKeyEnc: string | null;
    nowpaymentsCredsSource: string | null;
  } | null> {
    if (!isSoloApp()) return null;
    try {
      return await this.prisma.platformConfig.findUnique({
        where: { id: 'default' },
        select: {
          nowpaymentsPayoutEmail: true,
          nowpaymentsPayoutPasswordEnc: true,
          nowpaymentsApiKeyEnc: true,
          nowpaymentsPublicKeyEnc: true,
          nowpaymentsCredsSource: true,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/nowpaymentsPayout|nowpaymentsApiKey|nowpaymentsPublicKey|nowpaymentsCreds|Unknown arg|column/i.test(msg)) {
        this.logger.warn(`Payout creds DB read failed: ${msg}`);
      }
      try {
        const row = await this.prisma.platformConfig.findUnique({
          where: { id: 'default' },
          select: {
            nowpaymentsPayoutEmail: true,
            nowpaymentsPayoutPasswordEnc: true,
            nowpaymentsApiKeyEnc: true,
          },
        });
        return row
          ? {
              ...row,
              nowpaymentsPublicKeyEnc: null,
              nowpaymentsCredsSource: 'env',
            }
          : null;
      } catch {
        return null;
      }
    }
  }

  private async credsSnapshot(): Promise<{
    env: NowPaymentsCredsSnapshot;
    settings: NowPaymentsCredsSnapshot;
  }> {
    const envEmail = this.envPayoutEmail();
    const env: NowPaymentsCredsSnapshot = {
      apiKeySet: Boolean(this.envPrivateApiKey()),
      publicKeySet: Boolean(this.envPublicKey()),
      payoutEmailSet: Boolean(envEmail),
      payoutEmailMasked: envEmail ? this.maskEmail(envEmail) : null,
      payoutPasswordSet: Boolean(this.envPayoutPassword()),
    };
    const row = await this.loadSettingsRow();
    const settingsEmail = row?.nowpaymentsPayoutEmail?.trim() ?? '';
    const settings: NowPaymentsCredsSnapshot = {
      apiKeySet: Boolean(this.decryptEnc(row?.nowpaymentsApiKeyEnc)),
      publicKeySet: Boolean(this.decryptEnc(row?.nowpaymentsPublicKeyEnc)),
      payoutEmailSet: Boolean(settingsEmail),
      payoutEmailMasked: settingsEmail ? this.maskEmail(settingsEmail) : null,
      payoutPasswordSet: Boolean(this.decryptEnc(row?.nowpaymentsPayoutPasswordEnc)),
    };
    return { env, settings };
  }

  private async resolvePayoutCreds(): Promise<{
    apiKey: string;
    privateApiKey: string;
    email: string;
    password: string;
    publicKey: string;
    source: NowPaymentsCredsSource;
  }> {
    if (this.credsCache && Date.now() - this.credsCache.at < 15_000) {
      return this.credsCache;
    }
    const row = await this.loadSettingsRow();
    const source = this.normalizeSource(row?.nowpaymentsCredsSource);
    let privateApiKey = '';
    let publicKey = '';
    let email = '';
    let password = '';
    if (source === 'settings') {
      email = row?.nowpaymentsPayoutEmail?.trim() ?? '';
      password = this.decryptEnc(row?.nowpaymentsPayoutPasswordEnc);
      privateApiKey = this.decryptEnc(row?.nowpaymentsApiKeyEnc);
      publicKey = this.decryptEnc(row?.nowpaymentsPublicKeyEnc);
    } else {
      privateApiKey = this.envPrivateApiKey();
      email = this.envPayoutEmail();
      password = this.envPayoutPassword();
      publicKey = this.envPublicKey();
    }
    const apiKey = privateApiKey || publicKey;
    if (apiKey) this.apiKey = apiKey;
    this.credsCache = {
      apiKey,
      privateApiKey,
      email,
      password,
      publicKey,
      source,
      at: Date.now(),
    };
    return this.credsCache;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private defaultOrderDescription() {
    return isSoloApp() ? 'soloEmma wallet' : 'TraderRank Pro payment';
  }

  private async requestOnce<T>(
    path: string,
    options: RequestInit = {},
    flags?: { skipApiKey?: boolean; apiKeyOverride?: string },
  ): Promise<T> {
    await this.resolvePayoutCreds();
    const headers = new Headers(options.headers ?? undefined);
    const key = flags?.skipApiKey
      ? ''
      : flags?.apiKeyOverride || this.apiKey;
    if (key) {
      headers.set('x-api-key', key);
    } else {
      headers.delete('x-api-key');
    }
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const init: RequestInit = { ...options, headers };
    let res: Response;
    try {
      res = await fetch(`${this.apiUrl}${path}`, init);
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
      const message = this.friendlyNowpaymentsError(path, res.status, body);
      this.logger.error(`NOWPayments error ${path}: ${JSON.stringify(body)}`);
      throw new NowPaymentsApiError(message, res.status, body);
    }

    return body as T;
  }

  private rawNowpaymentsMessage(body: unknown): string {
    if (!body || typeof body !== 'object') return '';
    const payload = body as Record<string, unknown>;
    const nested =
      payload.error && typeof payload.error === 'object'
        ? (payload.error as Record<string, unknown>)
        : null;
    const parts = [
      payload.message,
      payload.code,
      payload.error,
      nested?.message,
      nested?.code,
    ]
      .filter((v) => typeof v === 'string' && v.trim())
      .map((v) => String(v).trim());
    return parts[0] ?? '';
  }

  private friendlyNowpaymentsError(
    path: string,
    status: number,
    body: unknown,
  ): string {
    const raw = this.rawNowpaymentsMessage(body);
    const blob = `${path} ${status} ${raw} ${JSON.stringify(body)}`.toLowerCase();

    if (status === 429) {
      return 'Payment service is temporarily busy — wait 30 seconds and try again';
    }

    if (path.startsWith('/auth')) {
      return (
        raw ||
        `NOWPayments payout login failed (${status}). Deposits can work with only an API key; withdrawals also need this account’s email and password, with 2FA off for API payouts.`
      );
    }

    if (status === 403 && path.startsWith('/payout')) {
      if (/invalid ip|ip address/i.test(blob)) {
        return 'NOWPayments blocked this payout because the solo-api IP is not whitelisted.';
      }
      return (
        raw ||
        'NOWPayments rejected the payout (403). Use the secret API key (not the public key) from the same account as the payout email/password. Do not send a TRC20 memo. 2FA on API payouts must be off.'
      );
    }

    if (/invalid ip|access denied|not whitelisted|whitelist/i.test(raw)) {
      if (/invalid ip|ip address/i.test(blob)) {
        return 'NOWPayments blocked this payout because the solo-api IP is not whitelisted. In NOWPayments: Settings → Payments → IP addresses, add Render outbound IPv4 and IPv6, or email whitelist@nowpayments.io to turn IP whitelist off.';
      }
      if (/wallet|address/i.test(blob) && /whitelist/i.test(blob)) {
        return 'NOWPayments blocked this payout because the destination wallet is not on the payout whitelist. Add it under Mass Payouts → Whitelist, or ask NOWPayments to disable wallet whitelisting.';
      }
    }

    if (status === 401 || /invalid token|unauthorized|jwt/i.test(raw)) {
      return 'NOWPayments rejected the payout login. Check that the secret API key, email, and password all belong to the same NOWPayments account.';
    }

    if (/2fa|verification_code|verify/i.test(blob)) {
      return 'NOWPayments created the payout but 2FA is still required. Turn payout 2FA off with whitelist@nowpayments.io, or confirm the batch in the NOWPayments dashboard.';
    }

    return raw || `NOWPayments request failed (${status})`;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    flags?: { skipApiKey?: boolean; apiKeyOverride?: string },
  ): Promise<T> {
    let lastError: NowPaymentsApiError | undefined;

    for (let attempt = 0; attempt <= NowPaymentsService.MAX_429_RETRIES; attempt++) {
      try {
        return await this.requestOnce<T>(path, options, flags);
      } catch (err) {
        if (!(err instanceof NowPaymentsApiError)) throw err;
        lastError = err;
        if (err.statusCode !== 429 || attempt >= NowPaymentsService.MAX_429_RETRIES) {
          throw err;
        }
        const waitMs = 1500 * (attempt + 1);
        this.logger.warn(
          `NOWPayments rate limited on ${path} — retry ${attempt + 1}/${NowPaymentsService.MAX_429_RETRIES} in ${waitMs}ms`,
        );
        await sleep(waitMs);
      }
    }

    throw lastError ?? new NowPaymentsApiError('NOWPayments request failed', 429);
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

  async getMinPaymentAmount(
    network: string,
    opts?: { fiatEquivalent?: string },
  ): Promise<{ minAmount: number; fiatEquivalent?: number }> {
    const currency = this.mapNetworkToCurrency(network);
    const params = new URLSearchParams({
      currency_from: currency,
      currency_to: currency,
      is_fixed_rate: 'false',
      is_fee_paid_by_user: 'false',
    });
    if (opts?.fiatEquivalent) {
      params.set('fiat_equivalent', opts.fiatEquivalent);
    }

    const result = await this.request<{
      min_amount?: number;
      fiat_equivalent?: number;
    }>(`/min-amount?${params.toString()}`, { headers: this.headers() });

    return {
      minAmount: Number(result.min_amount ?? 0),
      fiatEquivalent:
        result.fiat_equivalent != null
          ? Number(result.fiat_equivalent)
          : undefined,
    };
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
        order_description: params.description || this.defaultOrderDescription(),
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
        err.statusCode !== 429 &&
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
        order_description: params.description || this.defaultOrderDescription(),
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        ...(params.ipnCallbackUrl
          ? { ipn_callback_url: params.ipnCallbackUrl }
          : {}),
        is_fixed_rate: false,
      }),
    });
  }

  private async fetchPaymentStatus(paymentId: string) {
    return this.request<{
      payment_id: number;
      payment_status: string;
      pay_address: string;
      pay_amount: number;
      actually_paid: number;
      outcome_amount: number;
      pay_currency?: string;
    }>(`/payment/${paymentId}`, {
      headers: this.headers(),
    });
  }

  async getPaymentStatus(paymentId: string) {
    const cached = this.statusCache.get(paymentId);
    if (cached && Date.now() - cached.at < NowPaymentsService.STATUS_TTL_MS) {
      return cached.data;
    }
    const data = await this.fetchPaymentStatus(paymentId);
    this.statusCache.set(paymentId, { at: Date.now(), data });
    return data;
  }

  private async getPayoutAuthToken(): Promise<string> {
    if (this.payoutToken && Date.now() < this.payoutTokenExpiry) {
      return this.payoutToken;
    }

    const { email, password } = await this.resolvePayoutCreds();

    if (!email || !password) {
      throw new Error(
        isSoloApp()
          ? 'NOWPayments payout login is not saved yet — either user can enter the email and password in Settings'
          : 'NOWPayments payout credentials not configured — set NOWPAYMENTS_PAYOUT_EMAIL and NOWPAYMENTS_PAYOUT_PASSWORD on the API server (your NOWPayments account login), then restart',
      );
    }

    const result = await this.request<{ token: string }>(
      '/auth',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      },
      { skipApiKey: true },
    );

    if (!result?.token) {
      throw new Error('NOWPayments payout login did not return a token');
    }

    this.payoutToken = result.token;
    this.payoutTokenExpiry = Date.now() + 4 * 60 * 1000;
    return this.payoutToken;
  }

  async createPayout(params: {
    address: string;
    amount: number;
    currency: string;
    extraId?: string;
    ipnCallbackUrl?: string;
  }) {
    const { privateApiKey } = await this.resolvePayoutCreds();
    if (!privateApiKey) {
      throw new Error(
        'Withdrawals need the secret NOWPayments API key, not the public key. Deposits can work with the public key; payouts cannot.',
      );
    }
    const token = await this.getPayoutAuthToken();
    const withdrawal: Record<string, unknown> = {
      address: params.address,
      currency: params.currency,
      amount: params.amount,
    };
    if (params.extraId && !/^usdt/i.test(params.currency)) {
      withdrawal.extra_id = params.extraId;
    }
    if (params.ipnCallbackUrl) withdrawal.ipn_callback_url = params.ipnCallbackUrl;

    return this.request<{ id: string; withdrawals: unknown[] }>(
      '/payout',
      {
        method: 'POST',
        headers: this.headers({ Authorization: `Bearer ${token}` }),
        body: JSON.stringify({
          ...(params.ipnCallbackUrl
            ? { ipn_callback_url: params.ipnCallbackUrl }
            : {}),
          withdrawals: [withdrawal],
        }),
      },
      { apiKeyOverride: privateApiKey },
    );
  }

  async probePayoutConnection() {
    this.invalidatePayoutCredsCache();
    const creds = await this.resolvePayoutCreds();
    const result: {
      source: NowPaymentsCredsSource;
      privateApiKeySet: boolean;
      publicKeySet: boolean;
      payoutEmailSet: boolean;
      payoutPasswordSet: boolean;
      auth: { ok: boolean; error?: string };
      balance: { ok: boolean; error?: string };
    } = {
      source: creds.source,
      privateApiKeySet: Boolean(creds.privateApiKey),
      publicKeySet: Boolean(creds.publicKey),
      payoutEmailSet: Boolean(creds.email),
      payoutPasswordSet: Boolean(creds.password),
      auth: { ok: false },
      balance: { ok: false },
    };

    try {
      const token = await this.getPayoutAuthToken();
      result.auth = { ok: Boolean(token) };
    } catch (err) {
      result.auth = {
        ok: false,
        error: err instanceof Error ? err.message : 'Payout login failed',
      };
      return result;
    }

    if (!creds.privateApiKey) {
      result.balance = {
        ok: false,
        error:
          'Secret API key is missing. The public key is enough for deposits, not for withdrawals.',
      };
      return result;
    }

    try {
      await this.request(
        '/balance',
        {
          method: 'GET',
          headers: this.headers({
            Authorization: `Bearer ${this.payoutToken ?? ''}`,
          }),
        },
        { apiKeyOverride: creds.privateApiKey },
      );
      result.balance = { ok: true };
    } catch (err) {
      result.balance = {
        ok: false,
        error: err instanceof Error ? err.message : 'Balance check failed',
      };
    }
    return result;
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
