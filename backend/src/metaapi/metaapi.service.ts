import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TradeDirection } from '@prisma/client';
import { NotificationService } from '../email/notification.service';
import {
  classifyBrokerError,
  humanizeBrokerError,
  isPlatformLimitError,
} from '../common/broker-error.util';
import { normalizeChartSymbol } from '../ai/chart-setup.util';
import {
  getDerivDisplayName,
  getSymbolLookupVariants,
  normalizeDerivSymbol,
} from '../ai/deriv-symbols';
import {
  MetaApiOrderAction,
  MetaApiPendingAction,
  buildMetaApiTradeIdentifiers,
  normalizeTraderCommentName,
  tradeCommentBelongsToUser,
  resolvePendingOpenPrice,
  resolvePendingOrderType,
  roundToSymbolDigits,
} from './metaapi-order.util';

export type MetaApiAccount = {
  id: string;
  login: string;
  name: string;
  server: string;
  state: string;
  connectionStatus: string;
  type: string;
  region: string;
  version: number;
  baseCurrency: string;
  magic?: number;
  manualTrades?: boolean;
  copyFactoryRoles?: string[];
  tags?: string[];
  createdAt?: string;
  primaryReplica?: boolean;
};

export type MetaApiAccountsResult = {
  configured: boolean;
  count: number;
  items: MetaApiAccount[];
};

export type MetaApiSymbolPrice = {
  symbol: string;
  bid: number;
  ask: number;
  time: string;
  profitTickValue?: number;
  lossTickValue?: number;
};

export type MetaApiAccountInformation = {
  balance: number;
  equity: number;
  currency: string;
  margin: number;
  freeMargin: number;
  leverage: number;
  tradeAllowed: boolean;
  broker?: string;
  server?: string;
  login?: number;
  accountType?: string;
};

export type MetaApiPosition = {
  id: string;
  type: string;
  symbol: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  unrealizedProfit: number;
  swap: number;
  commission: number;
  time: string;
  comment?: string;
  clientId?: string;
};

export type MetaApiOrder = {
  id: string;
  type: string;
  state: string;
  symbol: string;
  openPrice: number;
  currentPrice: number;
  volume: number;
  currentVolume: number;
  stopLoss?: number;
  takeProfit?: number;
  time: string;
  comment?: string;
  clientId?: string;
};

export type MetaApiTerminalState = {
  configured: boolean;
  defaultAccountId: string | null;
  accountId: string | null;
  account: MetaApiAccount | null;
  information: MetaApiAccountInformation | null;
  positions: MetaApiPosition[];
  error?: string;
};

export type MetaApiSymbolSpec = {
  symbol: string;
  tickSize: number;
  contractSize: number;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  digits?: number;
};

export type MetaApiTradeResult = {
  numericCode: number;
  stringCode: string;
  message: string;
  orderId?: string;
  positionId?: string;
};

export type MetaApiPlacedOrder = {
  trade: MetaApiTradeResult;
  price: MetaApiSymbolPrice;
  orderKind: MetaApiOrderAction;
  openPrice: number;
  pending: boolean;
};

export type MetaApiLiveTradeState = {
  status: 'open' | 'pending' | 'none';
  positionId?: string;
  orderId?: string;
  openPrice?: number;
  currentPrice?: number;
  volume?: number;
  profit?: number;
  unrealizedProfit?: number;
  swap?: number;
  commission?: number;
  currency?: string;
  symbol?: string;
  comment?: string;
  stopLoss?: number;
  takeProfit?: number;
};

@Injectable()
export class MetaApiService {
  private readonly logger = new Logger(MetaApiService.name);
  private readonly provisioningUrl: string;
  private readonly token: string;
  private readonly configuredDefaultAccountId: string;
  private readonly configuredCopyAccountId: string;
  private readonly defaultVolume: number;
  private readonly symbolListCache = new Map<
    string,
    { symbols: string[]; expiresAt: number }
  >();
  private readonly lastLimitAlertAt = new Map<string, number>();

  constructor(
    private config: ConfigService,
    private notifications: NotificationService,
  ) {
    this.provisioningUrl =
      this.config.get<string>('METAAPI_PROVISIONING_URL') ||
      'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
    this.token = this.config.get<string>('METAAPI_TOKEN')?.trim() || '';
    this.configuredDefaultAccountId =
      this.config.get<string>('METAAPI_DEFAULT_ACCOUNT_ID')?.trim() || '';
    this.configuredCopyAccountId =
      this.config.get<string>('METAAPI_COPY_ACCOUNT_ID')?.trim() || '';
    const vol = Number(this.config.get<string>('METAAPI_TRADE_VOLUME') || '0.01');
    this.defaultVolume = Number.isFinite(vol) && vol > 0 ? vol : 0.01;
  }

  /**
   * Logs the raw broker error, alerts admins for platform-level limit issues
   * (throttled), and throws a trader-friendly BadRequestException.
   */
  private raiseBrokerError(raw: string, context: string, fallback?: string): never {
    this.logger.error(`MetaAPI ${context} failed: ${raw.slice(0, 500)}`);
    const kind = classifyBrokerError(raw);
    if (isPlatformLimitError(kind)) {
      this.alertAdminsOfLimit(kind, raw, context);
    }
    throw new BadRequestException(humanizeBrokerError(raw, fallback));
  }

  /** Email admins at most once every 6h per limit type. */
  private alertAdminsOfLimit(kind: string, raw: string, context: string) {
    const now = Date.now();
    const last = this.lastLimitAlertAt.get(kind) ?? 0;
    if (now - last < 6 * 60 * 60 * 1000) return;
    this.lastLimitAlertAt.set(kind, now);

    const titles: Record<string, string> = {
      rate_limit: 'MetaAPI rate limit hit — trades and price checks are failing',
      position_limit: 'MT5 max open positions reached — new orders are being rejected',
      no_money: 'MT5 account is out of free margin — orders are failing',
    };
    void this.notifications
      .adminSystemAlert(titles[kind] ?? 'MT5 platform limit warning', [
        `Traders are currently hitting a platform limit (<strong>${kind}</strong>) during: ${context}.`,
        `Raw broker response: <code>${raw.slice(0, 400)}</code>`,
        kind === 'rate_limit'
          ? 'Action: wait for the MetaAPI CPU-credit window to reset, or contact MetaAPI support to extend the quota.'
          : kind === 'position_limit'
            ? 'Action: close or reduce open positions on the MT5 account, or raise the broker position limit.'
            : 'Action: top up the MT5 account or reduce exposure so new orders can be placed.',
        'You will not receive another email about this limit for 6 hours.',
      ])
      .catch(() => undefined);
  }

  get isConfigured(): boolean {
    return Boolean(this.token);
  }

  getConfiguredDefaultAccountId(): string | null {
    return this.configuredDefaultAccountId || null;
  }

  getConfiguredCopyAccountId(): string | null {
    return this.configuredCopyAccountId || null;
  }

  resolveCopyAccountId(): string | null {
    return this.configuredCopyAccountId || null;
  }

  private headers(contentType = false) {
    const h: Record<string, string> = {
      Accept: 'application/json',
      'auth-token': this.token,
      'api-version': '2',
    };
    if (contentType) h['Content-Type'] = 'application/json';
    return h;
  }

  private clientUrl(region: string): string {
    const override = this.config.get<string>('METAAPI_CLIENT_URL')?.trim();
    if (override) return override.replace(/\/$/, '');
    const slug = region.trim().toLowerCase().replace(/_/g, '-');
    return `https://mt-client-api-v1.${slug}.agiliumtrade.ai`;
  }

  private mapAccount(raw: Record<string, unknown>): MetaApiAccount {
    return {
      id: String(raw._id ?? raw.id ?? ''),
      login: String(raw.login ?? ''),
      name: String(raw.name ?? ''),
      server: String(raw.server ?? ''),
      state: String(raw.state ?? ''),
      connectionStatus: String(raw.connectionStatus ?? ''),
      type: String(raw.type ?? ''),
      region: String(raw.region ?? ''),
      version: Number(raw.version ?? 0),
      baseCurrency: String(raw.baseCurrency ?? ''),
      magic: raw.magic != null ? Number(raw.magic) : undefined,
      manualTrades:
        typeof raw.manualTrades === 'boolean' ? raw.manualTrades : undefined,
      copyFactoryRoles: Array.isArray(raw.copyFactoryRoles)
        ? (raw.copyFactoryRoles as string[])
        : undefined,
      tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : undefined,
      createdAt:
        typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
      primaryReplica:
        typeof raw.primaryReplica === 'boolean'
          ? raw.primaryReplica
          : undefined,
    };
  }

  resolveAccountId(userAccountId?: string | null): string | null {
    const picked = userAccountId?.trim() || this.configuredDefaultAccountId;
    return picked || null;
  }

  async listAccounts(options?: {
    limit?: number;
    offset?: number;
    query?: string;
    deploymentStatus?: string;
  }): Promise<MetaApiAccountsResult> {
    if (!this.isConfigured) {
      return { configured: false, count: 0, items: [] };
    }

    const url = new URL(`${this.provisioningUrl}/users/current/accounts`);
    if (options?.limit) url.searchParams.set('limit', String(options.limit));
    if (options?.offset) url.searchParams.set('offset', String(options.offset));
    if (options?.query) url.searchParams.set('query', options.query);
    if (options?.deploymentStatus) {
      url.searchParams.set('deploymentStatus', options.deploymentStatus);
    }

    const res = await fetch(url.toString(), { headers: this.headers() });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      this.logger.error(
        `MetaAPI list accounts failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        (body.message as string) || `MetaAPI request failed (${res.status})`,
      );
    }

    if (Array.isArray(body)) {
      const items = body.map((row) =>
        this.mapAccount(row as Record<string, unknown>),
      );
      return { configured: true, count: items.length, items };
    }

    const items = Array.isArray(body.items)
      ? body.items.map((row) =>
          this.mapAccount(row as Record<string, unknown>),
        )
      : [];

    return {
      configured: true,
      count: Number(body.count ?? items.length),
      items,
    };
  }

  async getAccount(accountId: string): Promise<MetaApiAccount> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('METAAPI_TOKEN is not configured');
    }

    const res = await fetch(
      `${this.provisioningUrl}/users/current/accounts/${encodeURIComponent(accountId)}`,
      { headers: this.headers() },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      throw new ServiceUnavailableException(
        (body.message as string) ||
          `MetaAPI account lookup failed (${res.status})`,
      );
    }

    return this.mapAccount(body);
  }

  private async deployAccount(accountId: string) {
    const res = await fetch(
      `${this.provisioningUrl}/users/current/accounts/${encodeURIComponent(accountId)}/deploy`,
      { method: 'POST', headers: this.headers(true) },
    );
    if (res.status === 204 || res.ok) return;

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ServiceUnavailableException(
      (body.message as string) ||
        `MetaAPI deploy failed (${res.status})`,
    );
  }

  private async waitForConnection(
    accountId: string,
    timeoutMs = 45_000,
  ): Promise<MetaApiAccount> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const account = await this.getAccount(accountId);
      if (account.connectionStatus === 'CONNECTED') return account;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new ServiceUnavailableException(
      'Trading account is not connected yet — wait a moment and try again',
    );
  }

  async ensureAccountReady(accountId: string): Promise<MetaApiAccount> {
    let account = await this.getAccount(accountId);
    if (account.state !== 'DEPLOYED') {
      await this.deployAccount(accountId);
      account = await this.waitForConnection(accountId);
    } else if (account.connectionStatus !== 'CONNECTED') {
      account = await this.waitForConnection(accountId);
    }
    return account;
  }

  async listAccountSymbols(account: MetaApiAccount): Promise<string[]> {
    const cached = this.symbolListCache.get(account.id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.symbols;
    }

    const base = this.clientUrl(account.region);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/symbols`,
      { headers: this.headers() },
    );
    const body = (await res.json().catch(() => null)) as unknown;

    if (!res.ok || !Array.isArray(body)) {
      return [];
    }

    const symbols = body.map((s) => String(s));
    this.symbolListCache.set(account.id, {
      symbols,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return symbols;
  }

  /** Match platform symbol codes to the broker's MT5 symbol name (e.g. 1HZ10V → Volatility 10 (1s) Index). */
  async resolveBrokerSymbol(
    account: MetaApiAccount,
    symbol: string,
  ): Promise<string | null> {
    const variants = getSymbolLookupVariants(symbol);
    const symbols = await this.listAccountSymbols(account);
    if (symbols.length === 0) return null;

    const exact = new Set(symbols);
    const byLower = new Map(symbols.map((s) => [s.toLowerCase(), s]));
    for (const candidate of variants) {
      if (exact.has(candidate)) return candidate;
      const ci = byLower.get(candidate.toLowerCase());
      if (ci) return ci;
    }

    const canonical = normalizeDerivSymbol(symbol);
    const display = getDerivDisplayName(canonical)?.toLowerCase();
    for (const brokerSymbol of symbols) {
      if (normalizeDerivSymbol(brokerSymbol) === canonical) {
        return brokerSymbol;
      }
      if (display && brokerSymbol.toLowerCase() === display) {
        return brokerSymbol;
      }
    }

    return null;
  }

  async getSymbolPrice(
    account: MetaApiAccount,
    symbol: string,
  ): Promise<MetaApiSymbolPrice> {
    const variants = getSymbolLookupVariants(symbol);
    let lastError: BadRequestException | null = null;

    for (const brokerSymbol of variants) {
      try {
        return await this.fetchSymbolPrice(account, brokerSymbol);
      } catch (err) {
        if (err instanceof BadRequestException) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    const resolved = await this.resolveBrokerSymbol(account, symbol);
    if (resolved && !variants.includes(resolved)) {
      try {
        return await this.fetchSymbolPrice(account, resolved);
      } catch (err) {
        if (err instanceof BadRequestException) {
          lastError = err;
        } else {
          throw err;
        }
      }
    }

    const canonical = normalizeChartSymbol(symbol);
    throw (
      lastError ??
      new BadRequestException(`Could not get price for ${canonical}`)
    );
  }

  private async fetchSymbolPrice(
    account: MetaApiAccount,
    brokerSymbol: string,
  ): Promise<MetaApiSymbolPrice> {
    const base = this.clientUrl(account.region);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/symbols/${encodeURIComponent(brokerSymbol)}/current-price?keepSubscription=true`,
      { headers: this.headers() },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      this.raiseBrokerError(
        String(body.message ?? `status ${res.status}`),
        `price check for ${brokerSymbol}`,
        `Could not get a live price for ${brokerSymbol} right now. Please try again in a few minutes.`,
      );
    }

    return {
      symbol: String(body.symbol ?? brokerSymbol),
      bid: Number(body.bid),
      ask: Number(body.ask),
      time: String(body.time ?? new Date().toISOString()),
      profitTickValue:
        body.profitTickValue != null ? Number(body.profitTickValue) : undefined,
      lossTickValue:
        body.lossTickValue != null ? Number(body.lossTickValue) : undefined,
    };
  }

  async getAccountInformation(
    account: MetaApiAccount,
  ): Promise<MetaApiAccountInformation> {
    const base = this.clientUrl(account.region);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/account-information?refreshTerminalState=true`,
      { headers: this.headers() },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      this.raiseBrokerError(
        String(body.message ?? `status ${res.status}`),
        'account information read',
        'Could not read the trading account right now. Please try again in a few minutes.',
      );
    }

    return {
      balance: Number(body.balance ?? 0),
      equity: Number(body.equity ?? body.balance ?? 0),
      currency: String(body.currency ?? 'USD'),
      margin: Number(body.margin ?? 0),
      freeMargin: Number(body.freeMargin ?? 0),
      leverage: Number(body.leverage ?? 0),
      tradeAllowed: body.tradeAllowed !== false,
      broker: typeof body.broker === 'string' ? body.broker : undefined,
      server: typeof body.server === 'string' ? body.server : undefined,
      login: body.login != null ? Number(body.login) : undefined,
      accountType: typeof body.type === 'string' ? body.type : undefined,
    };
  }

  private mapPosition(raw: Record<string, unknown>): MetaApiPosition {
    return {
      id: String(raw.id ?? ''),
      type: String(raw.type ?? ''),
      symbol: String(raw.symbol ?? ''),
      volume: Number(raw.volume ?? 0),
      openPrice: Number(raw.openPrice ?? 0),
      currentPrice: Number(raw.currentPrice ?? 0),
      stopLoss: raw.stopLoss != null ? Number(raw.stopLoss) : undefined,
      takeProfit: raw.takeProfit != null ? Number(raw.takeProfit) : undefined,
      profit: Number(raw.profit ?? 0),
      unrealizedProfit: Number(raw.unrealizedProfit ?? 0),
      swap: Number(raw.swap ?? 0),
      commission: Number(raw.commission ?? 0),
      time: String(raw.time ?? raw.brokerTime ?? ''),
      comment: typeof raw.comment === 'string' ? raw.comment : undefined,
      clientId: typeof raw.clientId === 'string' ? raw.clientId : undefined,
    };
  }

  async getPositions(account: MetaApiAccount): Promise<MetaApiPosition[]> {
    const base = this.clientUrl(account.region);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/positions?refreshTerminalState=true`,
      { headers: this.headers() },
    );
    const body = (await res.json().catch(() => ({}))) as unknown;

    if (!res.ok) {
      const err = body as Record<string, unknown>;
      this.raiseBrokerError(
        String(err.message ?? `status ${res.status}`),
        'open positions read',
        'Could not read open positions right now. Please try again in a few minutes.',
      );
    }

    if (!Array.isArray(body)) return [];
    return body.map((row) => this.mapPosition(row as Record<string, unknown>));
  }

  private mapOrder(raw: Record<string, unknown>): MetaApiOrder {
    return {
      id: String(raw.id ?? ''),
      type: String(raw.type ?? ''),
      state: String(raw.state ?? ''),
      symbol: String(raw.symbol ?? ''),
      openPrice: Number(raw.openPrice ?? 0),
      currentPrice: Number(raw.currentPrice ?? 0),
      volume: Number(raw.volume ?? 0),
      currentVolume: Number(raw.currentVolume ?? raw.volume ?? 0),
      stopLoss: raw.stopLoss != null ? Number(raw.stopLoss) : undefined,
      takeProfit: raw.takeProfit != null ? Number(raw.takeProfit) : undefined,
      time: String(raw.time ?? raw.brokerTime ?? ''),
      comment: typeof raw.comment === 'string' ? raw.comment : undefined,
      clientId: typeof raw.clientId === 'string' ? raw.clientId : undefined,
    };
  }

  async getOrders(account: MetaApiAccount): Promise<MetaApiOrder[]> {
    const base = this.clientUrl(account.region);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/orders?refreshTerminalState=true`,
      { headers: this.headers() },
    );
    const body = (await res.json().catch(() => ({}))) as unknown;

    if (!res.ok) {
      const err = body as Record<string, unknown>;
      this.raiseBrokerError(
        String(err.message ?? `status ${res.status}`),
        'open orders read',
        'Could not read pending orders right now. Please try again in a few minutes.',
      );
    }

    if (!Array.isArray(body)) return [];
    return body.map((row) => this.mapOrder(row as Record<string, unknown>));
  }

  /** Pending limit/stop orders on the platform account for this trader. */
  async findUserPendingOrders(
    account: MetaApiAccount,
    displayName: string,
    userId: string,
  ): Promise<MetaApiOrder[]> {
    const ready = await this.ensureAccountReady(account.id);
    const orders = await this.getOrders(ready);
    return orders.filter((o) =>
      tradeCommentBelongsToUser(o.comment, displayName, userId),
    );
  }

  async getTerminalState(accountId: string): Promise<MetaApiTerminalState> {
    if (!this.isConfigured) {
      return {
        configured: false,
        defaultAccountId: null,
        accountId: null,
        account: null,
        information: null,
        positions: [],
        error: 'METAAPI_TOKEN is not configured',
      };
    }

    try {
      const account = await this.ensureAccountReady(accountId);
      const [information, positions] = await Promise.all([
        this.getAccountInformation(account),
        this.getPositions(account),
      ]);

      return {
        configured: true,
        defaultAccountId: this.getConfiguredDefaultAccountId(),
        accountId: account.id,
        account,
        information,
        positions,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load MetaAPI terminal';
      this.logger.warn(`MetaAPI terminal state failed: ${message}`);
      return {
        configured: true,
        defaultAccountId: this.getConfiguredDefaultAccountId(),
        accountId,
        account: null,
        information: null,
        positions: [],
        error: message,
      };
    }
  }

  async getSymbolSpecification(
    account: MetaApiAccount,
    symbol: string,
  ): Promise<MetaApiSymbolSpec> {
    const variants = [...getSymbolLookupVariants(symbol)];
    const resolved = await this.resolveBrokerSymbol(account, symbol);
    if (resolved && !variants.includes(resolved)) {
      variants.push(resolved);
    }

    let lastError: BadRequestException | null = null;

    for (const brokerSymbol of variants) {
      const spec = await this.fetchSymbolSpecification(account, brokerSymbol).catch(
        (err) => {
          if (err instanceof BadRequestException) {
            lastError = err;
            return null;
          }
          throw err;
        },
      );
      if (spec) return spec;
    }

    throw (
      lastError ??
      new BadRequestException(
        `Could not read symbol spec for ${normalizeChartSymbol(symbol)}`,
      )
    );
  }

  private async fetchSymbolSpecification(
    account: MetaApiAccount,
    brokerSymbol: string,
  ): Promise<MetaApiSymbolSpec> {
    const base = this.clientUrl(account.region);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/symbols/${encodeURIComponent(brokerSymbol)}/specification`,
      { headers: this.headers() },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      this.raiseBrokerError(
        String(body.message ?? `status ${res.status}`),
        `symbol spec for ${brokerSymbol}`,
        `Could not load trading details for ${brokerSymbol} right now. Please try again in a few minutes.`,
      );
    }

    return {
      symbol: String(body.symbol ?? brokerSymbol),
      tickSize: Number(body.tickSize ?? 0.00001),
      contractSize: Number(body.contractSize ?? 100_000),
      minVolume: Number(body.minVolume ?? 0.01),
      maxVolume: Number(body.maxVolume ?? 100),
      volumeStep: Number(body.volumeStep ?? 0.01),
      digits: body.digits != null ? Number(body.digits) : undefined,
    };
  }

  private tradeExtras(account: MetaApiAccount): Record<string, unknown> {
    const extras: Record<string, unknown> = {};
    const server = account.server?.toLowerCase() ?? '';
    const isDeriv = server.includes('deriv');
    if (
      isDeriv ||
      account.manualTrades === true ||
      account.magic === 0
    ) {
      extras.magic = 0;
    } else if (account.magic != null) {
      extras.magic = account.magic;
    }
    return extras;
  }

  private formatMetaApiError(
    body: Record<string, unknown>,
    status: number,
  ): string {
    const details = body.details;
    if (Array.isArray(details) && details.length > 0) {
      return details
        .map((row) => {
          const d = row as Record<string, unknown>;
          const param = d.parameter ?? d.field ?? 'field';
          const msg = d.message ?? d.msg ?? 'invalid';
          return `${String(param)}: ${String(msg)}`;
        })
        .join('; ');
    }
    return String(
      body.message ?? `Broker rejected the trade (${status})`,
    );
  }

  private normalizeTradePayload(
    payload: Record<string, unknown>,
    digits?: number,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...payload };
    const actionType = String(out.actionType ?? '');

    const supportsStops = [
      'ORDER_TYPE_BUY',
      'ORDER_TYPE_SELL',
      'ORDER_TYPE_BUY_LIMIT',
      'ORDER_TYPE_SELL_LIMIT',
      'ORDER_TYPE_BUY_STOP',
      'ORDER_TYPE_SELL_STOP',
      'ORDER_TYPE_BUY_STOP_LIMIT',
      'ORDER_TYPE_SELL_STOP_LIMIT',
      'POSITION_MODIFY',
      'ORDER_MODIFY',
    ].includes(actionType);

    if (!supportsStops) {
      return out;
    }

    const d =
      digits != null && Number.isFinite(digits) && digits >= 0 ? digits : 5;

    for (const key of ['openPrice', 'stopLoss', 'takeProfit'] as const) {
      if (typeof out[key] === 'number' && Number.isFinite(out[key])) {
        out[key] = roundToSymbolDigits(out[key] as number, d);
      }
    }

    if (typeof out.volume === 'number' && Number.isFinite(out.volume)) {
      out.volume = Number((out.volume as number).toFixed(8));
    }

    if (out.stopLoss != null) {
      out.stopLossUnits = 'ABSOLUTE_PRICE';
    }
    if (out.takeProfit != null) {
      out.takeProfitUnits = 'ABSOLUTE_PRICE';
    }
    if (out.openPrice != null) {
      out.openPriceUnits = 'ABSOLUTE_PRICE';
    }

    return out;
  }

  private async submitTrade(
    account: MetaApiAccount,
    payload: Record<string, unknown>,
    options?: { digits?: number },
  ): Promise<MetaApiTradeResult> {
    const base = this.clientUrl(account.region);
    const bodyPayload = this.normalizeTradePayload(payload, options?.digits);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/trade`,
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({ ...this.tradeExtras(account), ...bodyPayload }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const message = this.formatMetaApiError(body, res.status);
      this.logger.error(
        `MetaAPI trade failed (${res.status}): ${JSON.stringify(body).slice(0, 600)}`,
      );
      this.raiseBrokerError(
        message,
        'trade request',
        'The broker rejected this order. Please review your levels and try again.',
      );
    }

    const stringCode = String(body.stringCode ?? '');
    if (stringCode && stringCode !== 'TRADE_RETCODE_DONE') {
      this.raiseBrokerError(
        `${stringCode}: ${String(body.message ?? '')}`,
        'trade execution',
        'The broker rejected this order. Please review your levels and try again.',
      );
    }

    return {
      numericCode: Number(body.numericCode ?? 0),
      stringCode,
      message: String(body.message ?? 'Request completed'),
      orderId: body.orderId != null ? String(body.orderId) : undefined,
      positionId:
        body.positionId != null ? String(body.positionId) : undefined,
    };
  }

  async placeMarketOrder(input: {
    account: MetaApiAccount;
    symbol: string;
    direction: TradeDirection;
    volume?: number;
    stopLoss: number;
    takeProfit: number;
    comment?: string;
    clientId?: string;
    price?: MetaApiSymbolPrice;
    specDigits?: number;
  }): Promise<{ trade: MetaApiTradeResult; price: MetaApiSymbolPrice }> {
    const account = await this.ensureAccountReady(input.account.id);
    const price =
      input.price ?? (await this.getSymbolPrice(account, input.symbol));
    const brokerSymbol = price.symbol;

    const actionType =
      input.direction === 'BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
    const payload: Record<string, unknown> = {
      actionType,
      symbol: brokerSymbol,
      volume: input.volume ?? this.defaultVolume,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
    };
    if (input.comment) payload.comment = input.comment;
    if (input.clientId) payload.clientId = input.clientId;

    const trade = await this.submitTrade(account, payload, {
      digits: input.specDigits,
    });
    return { trade, price };
  }

  async placePendingOrder(input: {
    account: MetaApiAccount;
    symbol: string;
    orderKind: MetaApiPendingAction;
    volume: number;
    openPrice: number;
    stopLoss: number;
    takeProfit: number;
    comment?: string;
    clientId?: string;
    price?: MetaApiSymbolPrice;
    brokerSymbol?: string;
    specDigits?: number;
  }): Promise<{ trade: MetaApiTradeResult; price: MetaApiSymbolPrice }> {
    const account = await this.ensureAccountReady(input.account.id);
    const price =
      input.price ?? (await this.getSymbolPrice(account, input.symbol));
    const brokerSymbol =
      input.brokerSymbol ??
      price.symbol ??
      (await this.resolveBrokerSymbol(account, input.symbol)) ??
      normalizeChartSymbol(input.symbol);

    const payload: Record<string, unknown> = {
      actionType: input.orderKind,
      symbol: brokerSymbol,
      volume: input.volume,
      openPrice: input.openPrice,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
    };
    if (input.comment) payload.comment = input.comment;
    if (input.clientId) payload.clientId = input.clientId;

    const trade = await this.submitTrade(account, payload, {
      digits: input.specDigits,
    });
    return { trade, price };
  }

  async placeOrderWithFallback(input: {
    account: MetaApiAccount;
    symbol: string;
    direction: TradeDirection;
    volume: number;
    stopLoss: number;
    takeProfit: number;
    entryMin: number;
    entryMax: number;
    comment?: string;
    clientId?: string;
    price?: MetaApiSymbolPrice;
    specDigits?: number;
    recalculateVolume?: (openPrice: number) => Promise<number>;
  }): Promise<MetaApiPlacedOrder> {
    const account = await this.ensureAccountReady(input.account.id);
    const price =
      input.price ?? (await this.getSymbolPrice(account, input.symbol));
    const marketPrice =
      input.direction === 'BUY' ? price.ask : price.bid;
    const basePayload = {
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      comment: input.comment,
      clientId: input.clientId,
    };

    try {
      const { trade } = await this.placeMarketOrder({
        account,
        symbol: input.symbol,
        direction: input.direction,
        price,
        volume: input.volume,
        specDigits: input.specDigits,
        ...basePayload,
      });
      return {
        trade,
        price,
        orderKind:
          input.direction === 'BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
        openPrice: marketPrice,
        pending: false,
      };
    } catch (marketErr) {
      const marketMessage =
        marketErr instanceof BadRequestException
          ? marketErr.message
          : 'Market order rejected';

      const digits =
        input.specDigits ??
        (await this.getSymbolSpecification(account, price.symbol)).digits ??
        5;
      const openPrice = roundToSymbolDigits(
        resolvePendingOpenPrice(
          input.direction,
          input.entryMin,
          input.entryMax,
          marketPrice,
        ),
        digits,
      );
      const orderKind = resolvePendingOrderType(
        input.direction,
        openPrice,
        marketPrice,
      );

      this.logger.warn(
        `Market order failed for ${input.symbol} (${marketMessage}) — placing ${orderKind} @ ${openPrice}`,
      );

      const pendingVolume = input.recalculateVolume
        ? await input.recalculateVolume(openPrice)
        : input.volume;

      try {
        const { trade } = await this.placePendingOrder({
          account,
          symbol: input.symbol,
          orderKind,
          openPrice,
          volume: pendingVolume,
          price,
          specDigits: digits,
          ...basePayload,
        });
        return {
          trade,
          price,
          orderKind,
          openPrice,
          pending: true,
        };
      } catch (pendingErr) {
        const pendingMessage =
          pendingErr instanceof BadRequestException
            ? pendingErr.message
            : 'Pending order rejected';
        throw new BadRequestException(
          `Market order failed (${marketMessage}). Pending ${orderKind} @ ${openPrice} also failed (${pendingMessage}).`,
        );
      }
    }
  }

  async findLiveTradeForSignal(
    account: MetaApiAccount,
    lookup: {
      positionId?: string | null;
      orderId?: string | null;
      clientId: string;
      displayName: string;
      userId: string;
      symbol: string;
      activated: boolean;
    },
  ): Promise<MetaApiLiveTradeState> {
    const ready = await this.ensureAccountReady(account.id);
    const positions = await this.getPositions(ready);
    const info = await this.getAccountInformation(ready).catch(() => null);

    const userPositions = positions.filter((p) =>
      tradeCommentBelongsToUser(p.comment, lookup.displayName, lookup.userId),
    );

    const symbolVariants = new Set(
      [
        ...getSymbolLookupVariants(lookup.symbol),
        normalizeDerivSymbol(lookup.symbol),
      ].map((s) => s.toLowerCase()),
    );
    const matchesSymbol = (brokerSymbol: string) => {
      const norm = normalizeDerivSymbol(brokerSymbol).toLowerCase();
      if (symbolVariants.has(brokerSymbol.toLowerCase())) return true;
      if (symbolVariants.has(norm)) return true;
      return [...symbolVariants].some(
        (v) =>
          brokerSymbol.toLowerCase().includes(v) ||
          v.includes(brokerSymbol.toLowerCase()),
      );
    };

    const mapPosition = (position: MetaApiPosition): MetaApiLiveTradeState => ({
      status: 'open',
      positionId: position.id,
      openPrice: position.openPrice,
      currentPrice: position.currentPrice,
      volume: position.volume,
      profit: position.profit,
      unrealizedProfit: position.unrealizedProfit,
      swap: position.swap,
      commission: position.commission,
      currency: info?.currency ?? account.baseCurrency,
      symbol: position.symbol,
      comment: position.comment,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
    });

    if (lookup.positionId) {
      const owned = userPositions.find((p) => p.id === lookup.positionId);
      if (owned) return mapPosition(owned);
    }

    const byClient = userPositions.find(
      (p) => p.clientId && p.clientId === lookup.clientId,
    );
    if (byClient) return mapPosition(byClient);

    const bySymbol = userPositions.find((p) => matchesSymbol(p.symbol));
    if (bySymbol) return mapPosition(bySymbol);

    if (!lookup.activated && lookup.orderId) {
      return {
        status: 'pending',
        orderId: lookup.orderId,
        currency: info?.currency ?? account.baseCurrency,
        comment: normalizeTraderCommentName(
          lookup.displayName,
          lookup.userId,
        ),
      };
    }

    return { status: 'none' };
  }

  /** All open positions on the account that belong to this trader (by MT5 comment). */
  async findUserOpenPositions(
    account: MetaApiAccount,
    displayName: string,
    userId: string,
  ): Promise<MetaApiPosition[]> {
    const ready = await this.ensureAccountReady(account.id);
    const positions = await this.getPositions(ready);
    return positions.filter((p) =>
      tradeCommentBelongsToUser(p.comment, displayName, userId),
    );
  }

  async closePositionById(
    account: MetaApiAccount,
    positionId: string,
  ): Promise<MetaApiTradeResult> {
    const ready = await this.ensureAccountReady(account.id);
    return this.submitTrade(ready, {
      actionType: 'POSITION_CLOSE_ID',
      positionId,
    });
  }

  async closePositionPartialById(
    account: MetaApiAccount,
    positionId: string,
    volume: number,
  ): Promise<MetaApiTradeResult> {
    const ready = await this.ensureAccountReady(account.id);
    return this.submitTrade(ready, {
      actionType: 'POSITION_CLOSE_ID',
      positionId,
      volume,
    });
  }

  async modifyPositionStops(
    account: MetaApiAccount,
    input: {
      positionId: string;
      stopLoss?: number;
      takeProfit?: number;
      specDigits?: number;
    },
  ): Promise<MetaApiTradeResult> {
    const ready = await this.ensureAccountReady(account.id);
    const payload: Record<string, unknown> = {
      actionType: 'POSITION_MODIFY',
      positionId: input.positionId,
    };
    if (input.stopLoss != null) payload.stopLoss = input.stopLoss;
    if (input.takeProfit != null) payload.takeProfit = input.takeProfit;
    return this.submitTrade(ready, payload, { digits: input.specDigits });
  }

  async modifyPendingOrderStops(
    account: MetaApiAccount,
    input: {
      orderId: string;
      stopLoss?: number;
      takeProfit?: number;
      specDigits?: number;
    },
  ): Promise<MetaApiTradeResult> {
    const ready = await this.ensureAccountReady(account.id);
    const payload: Record<string, unknown> = {
      actionType: 'ORDER_MODIFY',
      orderId: input.orderId,
    };
    if (input.stopLoss != null) payload.stopLoss = input.stopLoss;
    if (input.takeProfit != null) payload.takeProfit = input.takeProfit;
    return this.submitTrade(ready, payload, { digits: input.specDigits });
  }

  async cancelPendingOrder(
    account: MetaApiAccount,
    orderId: string,
  ): Promise<MetaApiTradeResult> {
    const ready = await this.ensureAccountReady(account.id);
    return this.submitTrade(ready, {
      actionType: 'ORDER_CANCEL',
      orderId,
    });
  }

  buildClientIdForSignal(signalId: string, symbol: string): string {
    return buildMetaApiTradeIdentifiers({
      displayName: 'x',
      userId: 'x',
      signalId,
      symbol,
    }).clientId;
  }

  buildIdentifiersForUser(
    displayName: string,
    userId: string,
    signalId: string,
    symbol: string,
  ) {
    return buildMetaApiTradeIdentifiers({
      displayName,
      userId,
      signalId,
      symbol,
    });
  }

  async getMarkPrice(
    account: MetaApiAccount,
    symbol: string,
    direction: TradeDirection,
  ): Promise<number> {
    const quote = await this.getSymbolPrice(account, symbol);
    return direction === 'BUY' ? quote.bid : quote.ask;
  }

  /** Close or cancel a setup's MetaAPI trade when it belongs to this trader (comment match). */
  async closeSignalTradeIfOpen(input: {
    accountId: string;
    displayName: string;
    userId: string;
    signalId: string;
    symbol: string;
    metaApiPositionId?: string | null;
    metaApiOrderId?: string | null;
    tradeActivated: boolean;
  }): Promise<{ action: 'closed' | 'cancelled' | 'none'; positionId?: string }> {
    if (!this.isConfigured) return { action: 'none' };

    const account = await this.ensureAccountReady(input.accountId);
    const { clientId } = this.buildIdentifiersForUser(
      input.displayName,
      input.userId,
      input.signalId,
      input.symbol,
    );
    const live = await this.findLiveTradeForSignal(account, {
      positionId: input.metaApiPositionId,
      orderId: input.metaApiOrderId,
      clientId,
      displayName: input.displayName,
      userId: input.userId,
      symbol: input.symbol,
      activated: input.tradeActivated,
    });

    if (live.status === 'pending' && live.orderId) {
      await this.cancelPendingOrder(account, live.orderId);
      return { action: 'cancelled' };
    }

    if (live.status === 'open' && live.positionId) {
      await this.closePositionById(account, live.positionId);
      return { action: 'closed', positionId: live.positionId };
    }

    return { action: 'none' };
  }
}
