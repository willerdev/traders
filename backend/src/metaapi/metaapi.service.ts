import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TradeDirection } from '@prisma/client';
import { normalizeChartSymbol } from '../ai/chart-setup.util';

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
  freeMargin: number;
  leverage: number;
  tradeAllowed: boolean;
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

@Injectable()
export class MetaApiService {
  private readonly logger = new Logger(MetaApiService.name);
  private readonly provisioningUrl: string;
  private readonly token: string;
  private readonly defaultAccountId: string;
  private readonly defaultVolume: number;

  constructor(private config: ConfigService) {
    this.provisioningUrl =
      this.config.get<string>('METAAPI_PROVISIONING_URL') ||
      'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
    this.token = this.config.get<string>('METAAPI_TOKEN')?.trim() || '';
    this.defaultAccountId =
      this.config.get<string>('METAAPI_DEFAULT_ACCOUNT_ID')?.trim() || '';
    const vol = Number(this.config.get<string>('METAAPI_TRADE_VOLUME') || '0.01');
    this.defaultVolume = Number.isFinite(vol) && vol > 0 ? vol : 0.01;
  }

  get isConfigured(): boolean {
    return Boolean(this.token);
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
    const picked = userAccountId?.trim() || this.defaultAccountId;
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
      'MetaAPI account is not connected yet — wait a moment and try again',
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

  async getSymbolPrice(
    account: MetaApiAccount,
    symbol: string,
  ): Promise<MetaApiSymbolPrice> {
    const brokerSymbol = normalizeChartSymbol(symbol);
    const base = this.clientUrl(account.region);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/symbols/${encodeURIComponent(brokerSymbol)}/current-price`,
      { headers: this.headers() },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      throw new BadRequestException(
        (body.message as string) ||
          `Could not get price for ${brokerSymbol} (${res.status})`,
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
      throw new BadRequestException(
        (body.message as string) ||
          `Could not read account balance (${res.status})`,
      );
    }

    return {
      balance: Number(body.balance ?? 0),
      equity: Number(body.equity ?? body.balance ?? 0),
      currency: String(body.currency ?? 'USD'),
      freeMargin: Number(body.freeMargin ?? 0),
      leverage: Number(body.leverage ?? 0),
      tradeAllowed: body.tradeAllowed !== false,
    };
  }

  async getSymbolSpecification(
    account: MetaApiAccount,
    symbol: string,
  ): Promise<MetaApiSymbolSpec> {
    const brokerSymbol = normalizeChartSymbol(symbol);
    const base = this.clientUrl(account.region);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/symbols/${encodeURIComponent(brokerSymbol)}/specification`,
      { headers: this.headers() },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      throw new BadRequestException(
        (body.message as string) ||
          `Could not read symbol spec for ${brokerSymbol} (${res.status})`,
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
  }): Promise<{ trade: MetaApiTradeResult; price: MetaApiSymbolPrice }> {
    const account = await this.ensureAccountReady(input.account.id);
    const brokerSymbol = normalizeChartSymbol(input.symbol);
    const price =
      input.price ?? (await this.getSymbolPrice(account, brokerSymbol));

    const actionType =
      input.direction === 'BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
    const payload: Record<string, unknown> = {
      actionType,
      symbol: brokerSymbol,
      volume: input.volume ?? this.defaultVolume,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
    };
    if (input.comment) payload.comment = input.comment.slice(0, 31);
    if (input.clientId) payload.clientId = input.clientId.slice(0, 26);

    const base = this.clientUrl(account.region);
    const res = await fetch(
      `${base}/users/current/accounts/${encodeURIComponent(account.id)}/trade`,
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify(payload),
      },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      this.logger.error(
        `MetaAPI trade failed (${res.status}): ${JSON.stringify(body).slice(0, 400)}`,
      );
      throw new BadRequestException(
        (body.message as string) ||
          `MetaAPI trade rejected (${res.status})`,
      );
    }

    const stringCode = String(body.stringCode ?? '');
    if (stringCode && stringCode !== 'TRADE_RETCODE_DONE') {
      throw new BadRequestException(
        String(body.message ?? stringCode ?? 'Trade rejected by broker'),
      );
    }

    return {
      trade: {
        numericCode: Number(body.numericCode ?? 0),
        stringCode,
        message: String(body.message ?? 'Request completed'),
        orderId: body.orderId != null ? String(body.orderId) : undefined,
        positionId:
          body.positionId != null ? String(body.positionId) : undefined,
      },
      price,
    };
  }
}
