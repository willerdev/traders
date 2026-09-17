import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TradeDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveJwtSecret } from '../config/jwt-secret';
import {
  decryptCredential,
  encryptCredential,
} from '../common/credential-crypto.util';
import { ConfigService } from '@nestjs/config';
import {
  MetaApiAccount,
  MetaApiDeal,
  MetaApiOrder,
  MetaApiPosition,
  MetaApiService,
} from '../metaapi/metaapi.service';
import { roundToSymbolDigits } from '../metaapi/metaapi-order.util';
import { normalizeDerivSymbol } from '../ai/deriv-symbols';
import { computeOneToOnePrice } from '../common/rr.util';
import {
  defaultMt5ChartSlPips,
  getPipSize,
} from '../common/pip.util';
import {
  ModifyMt5PositionStopsDto,
  PlaceMt5MarketOrderDto,
} from '../common/dto';

function normalizeChartSymbol(raw: string): string {
  return normalizeDerivSymbol(raw);
}

function isSellType(type: string): boolean {
  return type.toLowerCase().includes('sell');
}

@Injectable()
export class SoloMt5Service {
  private readonly logger = new Logger(SoloMt5Service.name);

  constructor(
    private prisma: PrismaService,
    private metaApi: MetaApiService,
    private config: ConfigService,
  ) {}

  private cryptoSecret() {
    return resolveJwtSecret(this.config.get<string>('JWT_SECRET'));
  }

  private maskToken(token: string): string {
    const t = token.trim();
    if (t.length < 8) return '••••';
    return `${t.slice(0, 4)}••••${t.slice(-2)}`;
  }

  private async decryptCloudToken(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metaApiTokenEnc: true },
    });
    if (!user?.metaApiTokenEnc) return null;
    try {
      const token = decryptCredential(user.metaApiTokenEnc, this.cryptoSecret());
      return token.trim() || null;
    } catch {
      return null;
    }
  }

  private async withCloud<T>(
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const token = await this.decryptCloudToken(userId);
    if (token) return this.metaApi.runWithToken(token, fn);
    return fn();
  }

  async cloudStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        metaApiTokenEnc: true,
        metaApiTokenSavedAt: true,
        metaApiAccountId: true,
      },
    });
    const connected = Boolean(user?.metaApiTokenEnc);
    return {
      connected,
      connectedAt: user?.metaApiTokenSavedAt?.toISOString() ?? null,
      tokenMasked: connected ? '••••••••' : null,
      accountId: user?.metaApiAccountId ?? null,
    };
  }

  async saveCloudToken(userId: string, token: string) {
    const trimmed = token.trim();
    if (trimmed.length < 8) {
      throw new BadRequestException('That MetaAPI token looks too short.');
    }
    try {
      const listed = await this.metaApi.runWithToken(trimmed, () =>
        this.metaApi.listAccounts({ limit: 5 }),
      );
      if (!listed.configured) {
        throw new BadRequestException('MetaAPI rejected that token.');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : 'Token check failed';
      throw new BadRequestException(
        /401|unauthorized|auth|not configured/i.test(msg)
          ? 'MetaAPI rejected that token. Copy the API token from app.metaapi.cloud.'
          : msg,
      );
    }

    const enc = encryptCredential(trimmed, this.cryptoSecret());
    await this.prisma.user.update({
      where: { id: userId },
      data: { metaApiTokenEnc: enc, metaApiTokenSavedAt: new Date() },
    });
    return {
      connected: true,
      connectedAt: new Date().toISOString(),
      tokenMasked: this.maskToken(trimmed),
    };
  }

  async disconnectCloudToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        metaApiTokenEnc: null,
        metaApiTokenSavedAt: null,
        metaApiAccountId: null,
      },
    });
    return { connected: false };
  }

  async listCloudAccounts(userId: string) {
    const token = await this.decryptCloudToken(userId);
    if (!token) {
      throw new BadRequestException(
        'Paste your MetaAPI token first, then the account ID to monitor.',
      );
    }
    const listed = await this.metaApi.runWithToken(token, () =>
      this.metaApi.listAccounts({ limit: 100 }),
    );
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metaApiAccountId: true },
    });
    const selectedId = user?.metaApiAccountId?.trim() || null;
    const items = listed.items.map((row) => ({
      id: row.id,
      login: row.login,
      name: row.name,
      server: row.server,
      state: row.state,
      connectionStatus: row.connectionStatus,
      region: row.region,
      selected: row.id === selectedId,
    }));
    return { items, selectedId };
  }

  async linkCloudAccount(
    userId: string,
    accountIdRaw: string,
    tokenRaw?: string,
  ) {
    if (tokenRaw?.trim()) {
      await this.saveCloudToken(userId, tokenRaw);
    }

    const accountId = accountIdRaw.replace(/\s+/g, '').trim().toLowerCase();
    if (!accountId) {
      throw new BadRequestException('Paste the MetaAPI account ID to monitor.');
    }
    const token = await this.decryptCloudToken(userId);
    if (!token) {
      throw new BadRequestException(
        'Paste your MetaAPI API token together with the account ID.',
      );
    }
    let account: MetaApiAccount;
    try {
      account = await this.metaApi.runWithToken(token, () =>
        this.metaApi.getAccount(accountId),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Account lookup failed';
      throw new BadRequestException(
        /404|not found/i.test(msg)
          ? 'That MetaAPI account ID is not on this token. Copy the ID from the top of the account card in app.metaapi.cloud.'
          : msg,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        metaApiAccountId: account.id,
        mt5SyncActive: true,
        mt5SyncEnabled: true,
        mt5SyncEnrolledAt: new Date(),
        mt5SyncExpiresAt: null,
      },
    });

    return {
      accountId: account.id,
      account: {
        id: account.id,
        login: account.login,
        name: account.name,
        server: account.server,
        state: account.state,
        connectionStatus: account.connectionStatus,
      },
    };
  }

  async terminal(userId: string) {
    return this.withCloud(userId, () => this.loadTerminal(userId));
  }

  private async loadTerminal(userId: string) {
    const linked = await this.linkedAccountId(userId);
    if (!this.metaApi.isConfigured) {
      return this.emptyTerminal(
        'Paste your MetaAPI token and the account ID you want to monitor.',
      );
    }
    if (!linked) {
      return this.emptyTerminal(
        'Paste the MetaAPI account ID you want to monitor (from the account card).',
      );
    }

    try {
      const account = await this.metaApi.ensureAccountReady(linked);
      const [information, positions, orders] = await Promise.all([
        this.metaApi.getAccountInformation(account),
        this.metaApi.getPositions(account),
        this.metaApi.getOrders(account),
      ]);
      const running = positions.map((p) => this.mapPosition(p));
      const limits = orders.map((o) => this.mapOrder(o));
      const trades = [...running, ...limits];
      const floatingProfit = running.reduce((sum, t) => sum + (t.profit ?? 0), 0);
      const startingBalance = information.balance - floatingProfit;

      return {
        configured: true,
        accountSource: 'linked_live' as const,
        account: {
          startingBalance,
          currency: information.currency || 'USD',
          realizedProfit: 0,
          floatingProfit,
          totalProfit: floatingProfit,
          equity: information.equity,
        },
        investor: {
          investmentDeposited: 0,
          investmentBalance: 0,
          enrollmentPaid: 0,
          walletDeposited: 0,
          walletBalance: 0,
          mt5Balance: information.balance,
          mt5Equity: information.equity,
          currency: information.currency || 'USD',
        },
        setups: { items: [], count: 0, claimableCount: 0 },
        trades,
        history: { items: [], count: 0 },
        stats: {
          openSetupCount: 0,
          limitCount: limits.length,
          runningCount: running.length,
          floatingProfit,
          historyCount: 0,
        },
        refreshedAt: new Date().toISOString(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load MT5';
      this.logger.warn(`Solo MT5 terminal failed: ${msg}`);
      return this.emptyTerminal(msg);
    }
  }

  async quotes(userId: string) {
    return this.withCloud(userId, () => this.loadQuotes(userId));
  }

  private async loadQuotes(userId: string) {
    const ctx = await this.readyAccountOrNull(userId);
    if (!ctx) {
      return { items: [], refreshedAt: new Date().toISOString() };
    }
    const [positions, orders] = await Promise.all([
      this.metaApi.getPositions(ctx.account),
      this.metaApi.getOrders(ctx.account),
    ]);
    const symbols = [
      ...new Set(
        [...positions, ...orders]
          .map((row) => normalizeChartSymbol(row.symbol))
          .filter(Boolean),
      ),
    ].slice(0, 32);

    const items: Array<{
      signalId: string;
      symbol: string;
      direction: string;
      entryMin: number;
      entryMax: number;
      entryMid: number;
      bid: number | null;
      ask: number | null;
      mid: number | null;
      spread: number | null;
      change: number | null;
      changePct: number | null;
      time: string | null;
      submittedAt: string;
    }> = [];
    for (const symbol of symbols.slice(0, 8)) {
      const pos = positions.find(
        (p) => normalizeChartSymbol(p.symbol) === symbol,
      );
      try {
        const price = await this.metaApi.getSymbolPrice(ctx.account, symbol);
        const bid = price.bid;
        const ask = price.ask;
        const mid = (bid + ask) / 2;
        const entryMid = pos?.openPrice ?? mid;
        items.push({
          signalId: pos?.id ?? symbol,
          symbol,
          direction: pos
            ? isSellType(pos.type)
              ? 'SELL'
              : 'BUY'
            : 'BUY',
          entryMin: entryMid,
          entryMax: entryMid,
          entryMid,
          bid,
          ask,
          mid,
          spread: ask - bid,
          change: mid - entryMid,
          changePct: entryMid !== 0 ? ((mid - entryMid) / entryMid) * 100 : 0,
          time: price.time,
          submittedAt: new Date().toISOString(),
        });
      } catch {
        const mid = pos?.currentPrice ?? 0;
        items.push({
          signalId: symbol,
          symbol,
          direction: pos
            ? isSellType(pos.type)
              ? 'SELL'
              : 'BUY'
            : 'BUY',
          entryMin: mid,
          entryMax: mid,
          entryMid: mid,
          bid: mid || null,
          ask: mid || null,
          mid: mid || null,
          spread: null,
          change: null,
          changePct: null,
          time: null,
          submittedAt: new Date().toISOString(),
        });
      }
    }

    return { items, refreshedAt: new Date().toISOString() };
  }

  async quote(userId: string, symbol: string) {
    return this.withCloud(userId, () => this.loadQuote(userId, symbol));
  }

  private async loadQuote(userId: string, symbol: string) {
    const canonical = normalizeChartSymbol(symbol?.trim() || '');
    if (!canonical) {
      throw new BadRequestException('symbol is required');
    }
    const ctx = await this.requireAccount(userId);
    const price = await this.metaApi.getSymbolPrice(ctx.account, canonical);
    const bid = price.bid;
    const ask = price.ask;
    return {
      symbol: canonical,
      resolvedSymbol: price.symbol,
      bid,
      ask,
      mid: (bid + ask) / 2,
      spread: ask - bid,
      time: price.time,
      refreshedAt: new Date().toISOString(),
    };
  }

  async ohlc(
    userId: string,
    symbol: string,
    timeframe: string,
    limit?: number,
  ) {
    return this.withCloud(userId, () =>
      this.loadOhlc(userId, symbol, timeframe, limit),
    );
  }

  private async loadOhlc(
    userId: string,
    symbol: string,
    timeframe: string,
    limit?: number,
  ) {
    const canonical = normalizeChartSymbol(symbol?.trim() || '');
    if (!canonical) {
      throw new BadRequestException('symbol is required');
    }
    if (!timeframe?.trim()) {
      throw new BadRequestException('timeframe is required');
    }
    const ctx = await this.requireAccount(userId);
    const bars = await this.metaApi.getHistoricalCandles(
      ctx.account,
      canonical,
      timeframe.trim(),
      Math.min(limit ?? 400, 500),
    );
    return {
      symbol: canonical,
      timeframe: timeframe.trim().toUpperCase(),
      bars,
      source: 'metaapi' as const,
      refreshedAt: new Date().toISOString(),
    };
  }

  async running(userId: string) {
    const terminal = await this.terminal(userId);
    const trades = (terminal.trades ?? []).filter((t) => t.kind === 'running');
    return {
      trades,
      account: terminal.account,
      accountSource: terminal.accountSource,
      stats: {
        runningCount: trades.length,
        floatingProfit: terminal.stats.floatingProfit,
      },
      refreshedAt: terminal.refreshedAt,
    };
  }

  async batchQuotes(userId: string, symbols: string[]) {
    return this.withCloud(userId, () => this.loadBatchQuotes(userId, symbols));
  }

  private async loadBatchQuotes(userId: string, symbols: string[]) {
    const unique = [
      ...new Set(
        symbols.map((s) => normalizeChartSymbol(s?.trim() || '')).filter(Boolean),
      ),
    ].slice(0, 32);
    if (unique.length === 0) {
      return { items: [], refreshedAt: new Date().toISOString() };
    }
    const ctx = await this.readyAccountOrNull(userId);
    if (!ctx) {
      return { items: [], refreshedAt: new Date().toISOString() };
    }
    const items = await Promise.all(
      unique.map(async (symbol) => {
        try {
          const price = await this.metaApi.getSymbolPrice(ctx.account, symbol);
          const bid = price.bid;
          const ask = price.ask;
          return {
            symbol,
            resolvedSymbol: price.symbol,
            bid,
            ask,
            mid: (bid + ask) / 2,
            spread: ask - bid,
            time: price.time,
          };
        } catch {
          return {
            symbol,
            resolvedSymbol: symbol,
            bid: null,
            ask: null,
            mid: null,
            spread: null,
            time: null,
          };
        }
      }),
    );
    return { items, refreshedAt: new Date().toISOString() };
  }

  async previewOrder(
    userId: string,
    symbolRaw: string,
    directionRaw: string,
    volumeRaw?: number,
  ) {
    return this.withCloud(userId, () =>
      this.loadPreviewOrder(userId, symbolRaw, directionRaw, volumeRaw),
    );
  }

  private async loadPreviewOrder(
    userId: string,
    symbolRaw: string,
    directionRaw: string,
    volumeRaw?: number,
  ) {
    const symbol = normalizeChartSymbol(symbolRaw?.trim() || '');
    if (!symbol) throw new BadRequestException('Symbol is required');
    const direction =
      directionRaw?.toUpperCase() === 'SELL'
        ? TradeDirection.SELL
        : directionRaw?.toUpperCase() === 'BUY'
          ? TradeDirection.BUY
          : null;
    if (!direction) {
      throw new BadRequestException('Direction must be BUY or SELL');
    }
    const ctx = await this.requireAccount(userId);
    const price = await this.metaApi.getSymbolPrice(ctx.account, symbol);
    const spec = await this.metaApi.getSymbolSpecification(ctx.account, symbol);
    const digits = spec.digits ?? 5;
    const entry = direction === TradeDirection.BUY ? price.ask : price.bid;
    const pipSize = getPipSize(symbol);
    const slDistance = defaultMt5ChartSlPips(symbol) * pipSize;
    const stopLoss = roundToSymbolDigits(
      direction === TradeDirection.BUY ? entry - slDistance : entry + slDistance,
      digits,
    );
    const takeProfit = roundToSymbolDigits(
      computeOneToOnePrice(direction, entry, entry, stopLoss),
      digits,
    );
    const volume =
      volumeRaw != null && Number.isFinite(volumeRaw) && volumeRaw > 0
        ? volumeRaw
        : 0.01;
    const info = await this.metaApi.getAccountInformation(ctx.account);

    return {
      symbol,
      direction,
      entry,
      stopLoss,
      takeProfit,
      defaultSlPips: defaultMt5ChartSlPips(symbol),
      riskRewardRatio: 1,
      quote: price,
      risk: {
        volume,
        riskPercent: 1,
        riskAmount: Math.abs(entry - stopLoss) * volume,
        estimatedLossAtSl: Math.abs(entry - stopLoss) * volume,
        accountEquity: info.equity,
        currency: info.currency || 'USD',
      },
      refreshedAt: new Date().toISOString(),
    };
  }

  async placeOrder(userId: string, dto: PlaceMt5MarketOrderDto) {
    return this.withCloud(userId, () => this.loadPlaceOrder(userId, dto));
  }

  private async loadPlaceOrder(userId: string, dto: PlaceMt5MarketOrderDto) {
    const ctx = await this.requireAccount(userId);
    const symbol = normalizeChartSymbol(dto.symbol);
    const { trade, price } = await this.metaApi.placeMarketOrder({
      account: ctx.account,
      symbol,
      direction: dto.direction,
      volume: dto.volume ?? 0.01,
      stopLoss: dto.stopLoss,
      takeProfit: dto.takeProfit,
    });
    return {
      status: 'placed',
      signalId: trade.positionId ?? trade.orderId ?? symbol,
      symbol,
      direction: dto.direction,
      entryPrice: dto.direction === TradeDirection.BUY ? price.ask : price.bid,
      stopLoss: dto.stopLoss,
      takeProfit: dto.takeProfit,
      pending: Boolean(trade.orderId && !trade.positionId),
      quote: price,
      risk: {
        volume: dto.volume ?? 0.01,
        riskPercent: 1,
        riskAmount: 0,
        estimatedLossAtSl: 0,
        accountEquity: 0,
        currency: 'USD',
        aiManaged: false,
        notes: [],
      },
      metaApi: {
        accountId: ctx.account.id,
        accountName: ctx.account.name,
        orderId: trade.orderId,
        positionId: trade.positionId,
        message: trade.message,
      },
    };
  }

  async modifyStops(
    userId: string,
    positionId: string,
    dto: ModifyMt5PositionStopsDto,
  ) {
    return this.withCloud(userId, () =>
      this.loadModifyStops(userId, positionId, dto),
    );
  }

  private async loadModifyStops(
    userId: string,
    positionId: string,
    dto: ModifyMt5PositionStopsDto,
  ) {
    if (dto.stopLoss === undefined && dto.takeProfit === undefined) {
      throw new BadRequestException('Provide stopLoss and/or takeProfit to update');
    }
    const ctx = await this.requireAccount(userId);
    const positions = await this.metaApi.getPositions(ctx.account);
    const pos = positions.find((p) => p.id === positionId);
    if (pos) {
      const spec = await this.metaApi.getSymbolSpecification(
        ctx.account,
        pos.symbol,
      );
      const nextSl = dto.stopLoss !== undefined ? dto.stopLoss : pos.stopLoss;
      const nextTp =
        dto.takeProfit !== undefined ? dto.takeProfit : pos.takeProfit;
      this.assertStops(
        isSellType(pos.type) ? 'SELL' : 'BUY',
        pos.openPrice,
        dto.stopLoss !== undefined ? nextSl : undefined,
        dto.takeProfit !== undefined ? nextTp : undefined,
      );
      await this.metaApi.modifyPositionStops(ctx.account, {
        positionId,
        stopLoss: nextSl,
        takeProfit: nextTp,
        specDigits: spec.digits,
      });
      return {
        ok: true,
        positionId,
        stopLoss: nextSl ?? null,
        takeProfit: nextTp ?? null,
        message: 'Stop levels updated on broker',
      };
    }

    const orders = await this.metaApi.getOrders(ctx.account);
    const order = orders.find((o) => o.id === positionId);
    if (!order) {
      throw new NotFoundException('Position or pending order not found');
    }
    const spec = await this.metaApi.getSymbolSpecification(
      ctx.account,
      order.symbol,
    );
    const nextSl = dto.stopLoss !== undefined ? dto.stopLoss : order.stopLoss;
    const nextTp =
      dto.takeProfit !== undefined ? dto.takeProfit : order.takeProfit;
    await this.metaApi.modifyPendingOrderStops(ctx.account, {
      orderId: positionId,
      stopLoss: nextSl,
      takeProfit: nextTp,
      specDigits: spec.digits,
    });
    return {
      ok: true,
      positionId,
      stopLoss: nextSl ?? null,
      takeProfit: nextTp ?? null,
      message: 'Pending order stop levels updated on broker',
    };
  }

  async closePosition(userId: string, positionId: string) {
    return this.withCloud(userId, () => this.loadClosePosition(userId, positionId));
  }

  private async loadClosePosition(userId: string, positionId: string) {
    const ctx = await this.requireAccount(userId);
    const positions = await this.metaApi.getPositions(ctx.account);
    if (positions.some((p) => p.id === positionId)) {
      await this.metaApi.closePositionById(ctx.account, positionId);
      return { ok: true, positionId, status: 'closed' };
    }
    const orders = await this.metaApi.getOrders(ctx.account);
    if (orders.some((o) => o.id === positionId)) {
      await this.metaApi.cancelPendingOrder(ctx.account, positionId);
      return { ok: true, positionId, status: 'cancelled' };
    }
    throw new NotFoundException('Position or pending order not found');
  }

  async closeAll(userId: string) {
    return this.withCloud(userId, () => this.loadCloseAll(userId));
  }

  private async loadCloseAll(userId: string) {
    const ctx = await this.requireAccount(userId);
    const positions = await this.metaApi.getPositions(ctx.account);
    const results: {
      symbol: string;
      positionId?: string;
      status: string;
      error?: string;
    }[] = [];
    for (const pos of positions) {
      try {
        await this.metaApi.closePositionById(ctx.account, pos.id);
        results.push({
          symbol: pos.symbol,
          positionId: pos.id,
          status: 'closed',
        });
      } catch (err) {
        results.push({
          symbol: pos.symbol,
          positionId: pos.id,
          status: 'error',
          error: err instanceof Error ? err.message : 'close failed',
        });
      }
    }
    return { ok: true, results };
  }

  async history(userId: string, fresh = false, days = 2) {
    const window = Math.min(Math.max(days, 1), 120);
    return this.withCloud(userId, () =>
      this.loadHistory(userId, fresh, window),
    );
  }

  private async loadHistory(userId: string, fresh: boolean, days: number) {
    const ctx = await this.readyAccountOrNull(userId);
    if (!ctx) {
      return {
        items: [],
        count: 0,
        dealCount: 0,
        dayPnl: 0,
        refreshedAt: new Date().toISOString(),
      };
    }
    let deals: MetaApiDeal[] = [];
    try {
      deals = await this.metaApi.getHistoryDeals(ctx.account, {
        days,
        fresh,
      });
    } catch (err) {
      this.logger.warn(
        `Solo MT5 history failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return {
        items: [],
        count: 0,
        dealCount: 0,
        dayPnl: 0,
        refreshedAt: new Date().toISOString(),
        message: err instanceof Error ? err.message : 'Could not load history',
      };
    }
    const items = this.mapClosedDeals(deals);
    this.logger.log(
      `Solo MT5 history deals=${deals.length} closed=${items.length}`,
    );
    return {
      items,
      count: items.length,
      dealCount: deals.length,
      dayPnl: this.sumDealDayPnl(deals),
      refreshedAt: new Date().toISOString(),
    };
  }

  private sumDealDayPnl(deals: MetaApiDeal[]) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return deals.reduce((sum, deal) => {
      if (!this.isTradeDeal(deal.type)) return sum;
      const at = new Date(deal.time).getTime();
      if (!Number.isFinite(at) || at < startMs) return sum;
      return sum + deal.profit + deal.swap + deal.commission;
    }, 0);
  }

  private isTradeDeal(type: string) {
    const t = type.toUpperCase();
    if (
      t.includes('BALANCE') ||
      t.includes('CREDIT') ||
      t.includes('BONUS') ||
      t.includes('CHARGE') ||
      t.includes('CORRECTION') ||
      t.includes('COMMISSION') ||
      t.includes('INTEREST') ||
      t.includes('DIVIDEND') ||
      t.includes('TAX') ||
      t.includes('CANCELED') ||
      t.includes('CANCELLED')
    ) {
      return false;
    }
    return t.includes('BUY') || t.includes('SELL') || t.length === 0;
  }

  private isEntryOut(entry: string) {
    const e = entry.toUpperCase();
    return e.includes('OUT');
  }

  private isEntryInOnly(entry: string) {
    const e = entry.toUpperCase();
    return e.includes('IN') && !e.includes('OUT');
  }

  private mapClosedDeals(deals: MetaApiDeal[]) {
    const groups = new Map<string, MetaApiDeal[]>();
    for (const deal of deals) {
      if (!this.isTradeDeal(deal.type)) continue;
      const key = deal.positionId || deal.id;
      const list = groups.get(key) ?? [];
      list.push(deal);
      groups.set(key, list);
    }

    const items: Array<{
      id: string;
      signalId: string;
      symbol: string;
      direction: string;
      status: string;
      entryMin: number;
      entryMax: number;
      stopLoss: number;
      takeProfit: number;
      entryPrice: number | null;
      exitPrice: number | null;
      pnl: number | null;
      isWin: boolean | null;
      submittedAt: string;
      closedAt: string;
    }> = [];

    for (const [positionId, group] of groups) {
      group.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
      const inn =
        group.find((d) => this.isEntryInOnly(d.entry)) ?? group[0];
      const outs = group.filter((d) => this.isEntryOut(d.entry));
      const pnl = group.reduce(
        (sum, d) => sum + d.profit + d.swap + d.commission,
        0,
      );
      const stillOpen =
        outs.length === 0 &&
        group.length === 1 &&
        Math.abs(pnl) < 1e-8 &&
        !this.isEntryOut(group[0].entry);
      if (stillOpen) continue;

      const closeDeal = outs[outs.length - 1] ?? group[group.length - 1];
      if (!closeDeal) continue;
      const direction = this.isEntryInOnly(inn.entry)
        ? isSellType(inn.type)
          ? 'SELL'
          : 'BUY'
        : isSellType(closeDeal.type)
          ? 'BUY'
          : 'SELL';
      items.push({
        id: closeDeal.id || positionId,
        signalId: positionId,
        symbol: closeDeal.symbol || inn.symbol,
        direction,
        status: pnl > 0 ? 'WON' : pnl < 0 ? 'LOST' : 'ARCHIVED',
        entryMin: inn.price,
        entryMax: inn.price,
        stopLoss: 0,
        takeProfit: 0,
        entryPrice: inn.price || null,
        exitPrice: closeDeal.price,
        pnl,
        isWin: pnl > 0 ? true : pnl < 0 ? false : null,
        submittedAt: inn.time || closeDeal.time,
        closedAt: closeDeal.time,
      });
    }

    items.sort(
      (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
    );
    return items;
  }

  private emptyTerminal(message: string) {
    return {
      configured: this.metaApi.isConfigured,
      message,
      accountSource: undefined as 'linked_live' | undefined,
      account: undefined as
        | {
            startingBalance: number;
            currency: string;
            realizedProfit: number;
            floatingProfit: number;
            totalProfit: number;
            equity: number;
          }
        | undefined,
      setups: { items: [] as never[], count: 0, claimableCount: 0 },
      trades: [] as ReturnType<SoloMt5Service['mapPosition']>[],
      history: { items: [] as never[], count: 0 },
      stats: {
        openSetupCount: 0,
        limitCount: 0,
        runningCount: 0,
        floatingProfit: 0,
        historyCount: 0,
      },
      refreshedAt: new Date().toISOString(),
    };
  }

  private mapPosition(pos: MetaApiPosition) {
    const pnl = Number(pos.unrealizedProfit || pos.profit || 0);
    return {
      signalId: null as string | null,
      symbol: pos.symbol,
      direction: isSellType(pos.type) ? 'SELL' : 'BUY',
      kind: 'running' as const,
      status: 'open' as const,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      volume: pos.volume,
      openPrice: pos.openPrice,
      currentPrice: pos.currentPrice,
      profit: pnl,
      positionId: pos.id,
      canClose: true,
      canAdjustStops: true,
      canPartialClose: pos.volume > 0,
      executionLabel: 'Running on your linked MT5',
    };
  }

  private mapOrder(order: MetaApiOrder) {
    return {
      signalId: null as string | null,
      symbol: order.symbol,
      direction: isSellType(order.type) ? 'SELL' : 'BUY',
      kind: 'limit' as const,
      status: 'pending' as const,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      volume: order.currentVolume ?? order.volume,
      openPrice: order.openPrice,
      currentPrice: order.currentPrice,
      orderId: order.id,
      orderType: order.type,
      canClose: true,
      canAdjustStops: true,
      executionLabel: 'Pending on your linked MT5',
    };
  }

  private assertStops(
    direction: 'BUY' | 'SELL',
    openPrice: number,
    stopLoss?: number,
    takeProfit?: number,
  ) {
    if (stopLoss != null) {
      const ok =
        direction === 'BUY' ? stopLoss < openPrice : stopLoss > openPrice;
      if (!ok) {
        throw new BadRequestException(
          'Stop loss must be below entry for buys and above entry for sells.',
        );
      }
    }
    if (takeProfit != null) {
      const ok =
        direction === 'BUY' ? takeProfit > openPrice : takeProfit < openPrice;
      if (!ok) {
        throw new BadRequestException(
          'Take profit must be above entry for buys and below entry for sells.',
        );
      }
    }
  }

  private async linkedAccountId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metaApiAccountId: true },
    });
    return user?.metaApiAccountId?.trim() || null;
  }

  private async readyAccountOrNull(userId: string): Promise<{
    account: MetaApiAccount;
  } | null> {
    if (!this.metaApi.isConfigured) return null;
    const id = await this.linkedAccountId(userId);
    if (!id) return null;
    try {
      const account = await this.metaApi.ensureAccountReady(id);
      return { account };
    } catch (err) {
      this.logger.warn(
        `Solo MT5 account not ready: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async requireAccount(userId: string) {
    if (!this.metaApi.isConfigured) {
      throw new ServiceUnavailableException(
        'Paste your MetaAPI token and the account ID you want to monitor.',
      );
    }
    const id = await this.linkedAccountId(userId);
    if (!id) {
      throw new BadRequestException(
        'Paste the MetaAPI account ID you want to monitor.',
      );
    }
    const account = await this.metaApi.ensureAccountReady(id);
    return { account };
  }
}
