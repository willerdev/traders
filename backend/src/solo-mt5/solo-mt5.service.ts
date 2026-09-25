import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TradeDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveJwtSecret } from '../config/jwt-secret';
import { resolveSoloSharedOwnerUserId, assertSoloCanManageTrades } from '../common/solo-admin.util';
import {
  decryptCredential,
  encryptCredential,
} from '../common/credential-crypto.util';
import { ConfigService } from '@nestjs/config';
import { DerivService } from '../deriv/deriv.service';
import {
  computeAllocatedWallet,
  isSharedLiveBook,
  isSoloAllocatedTraderEmail,
  roundAllocatedUsdt,
  sumLedgerDepositsAndProfits,
  tradingCapitalLockUsdt,
} from '../common/solo-allocated-trader.util';
import {
  MetaApiAccount,
  MetaApiDeal,
  MetaApiOrder,
  MetaApiPosition,
  MetaApiService,
  MetaApiSymbolSpec,
} from '../metaapi/metaapi.service';
import {
  roundToSymbolDigits,
  type MetaApiPendingAction,
} from '../metaapi/metaapi-order.util';
import {
  classifyBrokerError,
  humanizeBrokerError,
} from '../common/broker-error.util';
import { normalizeDerivSymbol } from '../ai/deriv-symbols';
import { isAfterSoloMt5HistoryReset } from '../common/solo-mt5-history-since';
import { computeOneToOnePrice } from '../common/rr.util';
import {
  defaultMt5ChartSlPips,
  getPipSize,
} from '../common/pip.util';
import { SoloTraderService } from './solo-trader.service';
import {
  buildSoloOpenComment,
  sanitizeSoloCommentPart,
} from '../common/solo-trade-operator.util';
import {
  ModifyMt5PositionStopsDto,
  PartialCloseMt5PositionDto,
  PlaceMt5MarketOrderDto,
} from '../common/dto';

function normalizeChartSymbol(raw: string): string {
  return normalizeDerivSymbol(raw);
}

function isSellType(type: string): boolean {
  return type.toLowerCase().includes('sell');
}

function resolveSoloOrderPlacement(dto: PlaceMt5MarketOrderDto): {
  direction: TradeDirection;
  pendingKind: MetaApiPendingAction | null;
} {
  const kind = (dto.orderKind || 'MARKET').trim().toUpperCase();
  if (kind === 'MARKET' || kind === '') {
    return { direction: dto.direction, pendingKind: null };
  }
  if (kind === 'BUY_LIMIT') {
    return {
      direction: TradeDirection.BUY,
      pendingKind: 'ORDER_TYPE_BUY_LIMIT',
    };
  }
  if (kind === 'SELL_LIMIT') {
    return {
      direction: TradeDirection.SELL,
      pendingKind: 'ORDER_TYPE_SELL_LIMIT',
    };
  }
  if (kind === 'BUY_STOP') {
    return {
      direction: TradeDirection.BUY,
      pendingKind: 'ORDER_TYPE_BUY_STOP',
    };
  }
  if (kind === 'SELL_STOP') {
    return {
      direction: TradeDirection.SELL,
      pendingKind: 'ORDER_TYPE_SELL_STOP',
    };
  }
  throw new BadRequestException(
    'Order type must be market, buy limit, sell limit, buy stop, or sell stop',
  );
}

function assertPendingVsQuote(
  pendingKind: MetaApiPendingAction,
  openPrice: number,
  bid: number,
  ask: number,
) {
  if (pendingKind === 'ORDER_TYPE_BUY_LIMIT' && openPrice >= ask) {
    throw new BadRequestException('Buy limit must be below the current ask');
  }
  if (pendingKind === 'ORDER_TYPE_SELL_LIMIT' && openPrice <= bid) {
    throw new BadRequestException('Sell limit must be above the current bid');
  }
  if (pendingKind === 'ORDER_TYPE_BUY_STOP' && openPrice <= ask) {
    throw new BadRequestException('Buy stop must be above the current ask');
  }
  if (pendingKind === 'ORDER_TYPE_SELL_STOP' && openPrice >= bid) {
    throw new BadRequestException('Sell stop must be below the current bid');
  }
}

function brokerMinStopDistance(spec: MetaApiSymbolSpec): number {
  const digits = spec.digits ?? 5;
  const tick = spec.tickSize > 0 ? spec.tickSize : 10 ** -digits;
  const points = Math.max(spec.stopsLevel ?? 0, spec.freezeLevel ?? 0, 0);
  return Math.max(points * tick, tick);
}

function formatStopDistance(
  priceDist: number,
  spec: MetaApiSymbolSpec,
  symbol: string,
): string {
  const digits = spec.digits ?? 5;
  const tick = spec.tickSize > 0 ? spec.tickSize : 10 ** -digits;
  const points = priceDist / tick;
  const pipSize = getPipSize(symbol);
  const pips = pipSize > 0 ? priceDist / pipSize : 0;
  const price = priceDist.toFixed(Math.min(digits, 5));
  if (pipSize >= tick * 5) {
    return `${price} (${points.toFixed(0)} points / ~${pips.toFixed(1)} pips)`;
  }
  return `${price} (${points.toFixed(0)} points)`;
}

@Injectable()
export class SoloMt5Service {
  private readonly logger = new Logger(SoloMt5Service.name);

  constructor(
    private prisma: PrismaService,
    private metaApi: MetaApiService,
    private config: ConfigService,
    @Optional() private deriv?: DerivService,
    @Optional() private traders?: SoloTraderService,
  ) {}

  private cryptoSecret() {
    return resolveJwtSecret(this.config.get<string>('JWT_SECRET'));
  }

  private maskToken(token: string): string {
    const t = token.trim();
    if (t.length < 8) return '••••';
    return `${t.slice(0, 4)}••••${t.slice(-2)}`;
  }

  private async ownerUserId(userId: string): Promise<string> {
    const { ownerUserId } = await resolveSoloSharedOwnerUserId(
      this.prisma,
      userId,
    );
    return ownerUserId;
  }

  private async decryptCloudToken(userId: string): Promise<string | null> {
    const ownerId = await this.ownerUserId(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
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

  private async isAllocatedTrader(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return isSoloAllocatedTraderEmail(user?.email);
  }

  /**
   * Trading book shown to users: locked capital + open floating only.
   * Closed-trade history is a separate feed and must not change this balance.
   */
  private syntheticTradingAccount(
    currency: string,
    floatingProfit: number,
  ): {
    startingBalance: number;
    currency: string;
    realizedProfit: number;
    floatingProfit: number;
    totalProfit: number;
    equity: number;
  } {
    const lock = tradingCapitalLockUsdt();
    const floating = roundAllocatedUsdt(floatingProfit);
    return {
      startingBalance: lock,
      currency: currency || 'USD',
      realizedProfit: 0,
      floatingProfit: floating,
      totalProfit: floating,
      equity: roundAllocatedUsdt(lock + floating),
    };
  }

  async allocatedBook(userId: string): Promise<{
    deposit: number;
    liveTradingBalance: number;
    profitsMade: number;
    remaining: number;
    dedicatedLive: boolean;
    source: 'metaapi' | 'deriv' | 'pnl';
    currency: string;
    tradingEquity: number;
    withdrawn: number;
    metaApiCapital: number;
    tradingCapitalLock: number;
  } | null> {
    if (!(await this.isAllocatedTrader(userId))) return null;
    return this.withCloud(userId, () => this.loadAllocatedBook(userId));
  }

  async allocatedWalletAvailable(
    userId: string,
    ledgerAvailable: number,
  ): Promise<number | null> {
    if (!(await this.isAllocatedTrader(userId))) return null;
    // Show the Soloema ledger. Deriv/MetaAPI capital is not deducted from wallet.
    return roundAllocatedUsdt(Math.max(0, ledgerAvailable));
  }

  private async loadAllocatedBook(userId: string) {
    if (!(await this.isAllocatedTrader(userId))) return null;
    const tradingCapitalLock = tradingCapitalLockUsdt();
    const cutoffDeposit = await this.prisma.walletTransaction.findFirst({
      where: {
        userId,
        type: { in: ['DEPOSITOR_DEPOSIT', 'DEPOSIT'] },
        amount: { gte: 499.99 },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const txs = await this.prisma.walletTransaction.findMany({
      where: {
        userId,
        ...(cutoffDeposit
          ? { createdAt: { gte: cutoffDeposit.createdAt } }
          : {}),
      },
      select: { amount: true, type: true },
    });
    const { deposits, profits, withdrawn } = sumLedgerDepositsAndProfits(txs);

    let mt5Balance = 0;
    let mt5Equity = 0;
    let floating = 0;
    let currency = 'USD';
    try {
      const ctx = await this.readyAccountOrNull(userId);
      if (ctx) {
        const [information, positions] = await Promise.all([
          this.metaApi.getAccountInformation(ctx.account),
          this.metaApi.getPositions(ctx.account),
        ]);
        mt5Balance = Number(information.balance ?? 0);
        mt5Equity = Number(information.equity ?? mt5Balance);
        currency = information.currency || 'USD';
        floating = positions.reduce(
          (sum, p) =>
            sum + Number(p.unrealizedProfit || p.profit || 0),
          0,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Allocated MetaAPI book failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    let derivBalance = 0;
    if (this.deriv && mt5Equity <= 0) {
      derivBalance = await this.deriv.tradingUsdBalance(userId);
    }

    const liveEquity = mt5Equity > 0 ? mt5Equity : derivBalance;
    const dedicatedLive =
      liveEquity > 0 && !isSharedLiveBook(liveEquity, tradingCapitalLock);
    // Deriv/MetaAPI capital is not Soloema wallet funds — never subtract it here.
    const metaApiCapital = 0;
    const source: 'metaapi' | 'deriv' | 'pnl' = dedicatedLive
      ? mt5Equity > 0
        ? 'metaapi'
        : 'deriv'
      : 'pnl';

    const remaining = computeAllocatedWallet({
      deposits,
      profits,
      withdrawn,
      tradingCapitalLock,
      metaApiCapital,
    });

    return {
      deposit: deposits,
      liveTradingBalance: roundAllocatedUsdt(tradingCapitalLock + metaApiCapital),
      profitsMade: profits,
      remaining,
      dedicatedLive,
      source,
      currency,
      tradingEquity: roundAllocatedUsdt(tradingCapitalLock + floating),
      withdrawn,
      metaApiCapital,
      tradingCapitalLock,
    };
  }

  private applyAllocatedAccount<T extends {
    startingBalance: number;
    realizedProfit: number;
    floatingProfit: number;
    totalProfit: number;
    equity: number;
    currency: string;
  }>(
    account: T,
    book: {
      tradingEquity: number;
      profitsMade: number;
      tradingCapitalLock: number;
      currency: string;
    },
  ): T {
    return {
      ...account,
      startingBalance: book.tradingCapitalLock,
      realizedProfit: 0,
      floatingProfit: roundAllocatedUsdt(
        book.tradingEquity - book.tradingCapitalLock,
      ),
      totalProfit: roundAllocatedUsdt(
        book.tradingEquity - book.tradingCapitalLock,
      ),
      equity: book.tradingEquity,
      currency: book.currency || account.currency,
    };
  }

  async cloudStatus(userId: string) {
    const shared = await resolveSoloSharedOwnerUserId(this.prisma, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: shared.ownerUserId },
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
      shared: shared.shared,
      ownerEmail: shared.shared ? shared.ownerEmail : null,
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
    const ownerId = await this.ownerUserId(userId);
    await this.prisma.user.update({
      where: { id: ownerId },
      data: { metaApiTokenEnc: enc, metaApiTokenSavedAt: new Date() },
    });
    return {
      connected: true,
      connectedAt: new Date().toISOString(),
      tokenMasked: this.maskToken(trimmed),
    };
  }

  async disconnectCloudToken(userId: string) {
    const ownerId = await this.ownerUserId(userId);
    await this.prisma.user.update({
      where: { id: ownerId },
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
    const ownerId = await this.ownerUserId(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
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

    const ownerId = await this.ownerUserId(userId);
    await this.prisma.user.update({
      where: { id: ownerId },
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
      const [information, positionsRaw, ordersRaw] = await Promise.all([
        this.metaApi.getAccountInformation(account),
        this.metaApi.getPositions(account),
        this.metaApi.getOrders(account),
      ]);
      const positions = await this.onlyOwnPositions(userId, positionsRaw);
      const orders = await this.onlyOwnOrders(userId, ordersRaw);
      const running = positions.map((p) => this.mapPosition(p));
      const limits = orders.map((o) => this.mapOrder(o));
      const trades = [...running, ...limits];
      const floatingProfit = running.reduce((sum, t) => sum + (t.profit ?? 0), 0);
      const displayAccount = this.syntheticTradingAccount(
        information.currency || 'USD',
        floatingProfit,
      );
      const book = await this.loadAllocatedBook(userId);

      return {
        configured: true,
        accountSource: 'linked_live' as const,
        account: displayAccount,
        investor: {
          investmentDeposited: book?.deposit ?? 0,
          investmentBalance: book?.remaining ?? 0,
          enrollmentPaid: 0,
          walletDeposited: book?.deposit ?? 0,
          walletBalance: book?.remaining ?? 0,
          mt5Balance: information.balance,
          mt5Equity: information.equity,
          currency: information.currency || 'USD',
          allocatedDeposit: book?.deposit ?? null,
          liveTradingBalance: book?.liveTradingBalance ?? null,
          profitsMade: book?.profitsMade ?? null,
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
    const [positionsRaw, ordersRaw] = await Promise.all([
      this.metaApi.getPositions(ctx.account),
      this.metaApi.getOrders(ctx.account),
    ]);
    const positions = await this.onlyOwnPositions(userId, positionsRaw);
    const orders = await this.onlyOwnOrders(userId, ordersRaw);
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
    return this.withCloud(userId, () => this.loadRunning(userId));
  }

  private async loadRunning(userId: string) {
    const empty = {
      trades: [] as ReturnType<SoloMt5Service['mapPosition']>[],
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
      accountSource: 'linked_live' as const,
      stats: { runningCount: 0, floatingProfit: 0 },
      refreshedAt: new Date().toISOString(),
    };
    if (!this.metaApi.isConfigured) return empty;
    const ctx = await this.readyAccountOrNull(userId);
    if (!ctx) return empty;
    const [information, positionsRaw] = await Promise.all([
      this.metaApi.getAccountInformation(ctx.account),
      this.metaApi.getPositions(ctx.account),
    ]);
    const positions = await this.onlyOwnPositions(userId, positionsRaw);
    const trades = positions.map((p) => this.mapPosition(p));
    const floatingProfit = trades.reduce((sum, t) => sum + (t.profit ?? 0), 0);
    const book = await this.loadAllocatedBook(userId);
    return {
      trades,
      accountSource: 'linked_live' as const,
      account: this.syntheticTradingAccount(
        information.currency || 'USD',
        floatingProfit,
      ),
      stats: {
        runningCount: trades.length,
        floatingProfit,
      },
      refreshedAt: new Date().toISOString(),
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
    await this.assertCanManageTrades(userId);
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
    const book = await this.loadAllocatedBook(userId);

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
        accountEquity: book?.tradingEquity ?? info.equity,
        currency: info.currency || 'USD',
      },
      refreshedAt: new Date().toISOString(),
    };
  }

  async placeOrder(userId: string, dto: PlaceMt5MarketOrderDto) {
    await this.assertCanManageTrades(userId);
    await this.traders?.assertCanOpenTrades(userId);
    return this.withCloud(userId, () => this.loadPlaceOrder(userId, dto));
  }

  private async loadPlaceOrder(userId: string, dto: PlaceMt5MarketOrderDto) {
    const ctx = await this.requireAccount(userId);
    const symbol = normalizeChartSymbol(dto.symbol);
    const spec = await this.metaApi.getSymbolSpecification(ctx.account, symbol);
    const price = await this.metaApi.getSymbolPrice(ctx.account, symbol);
    const volume = dto.volume ?? 0.01;
    const placement = resolveSoloOrderPlacement(dto);
    const digits = spec.digits ?? 5;
    const marketEntry =
      placement.direction === TradeDirection.BUY ? price.ask : price.bid;
    let entry = marketEntry;
    if (placement.pendingKind) {
      if (dto.openPrice == null || !Number.isFinite(dto.openPrice)) {
        throw new BadRequestException('Enter a price for this pending order');
      }
      entry = roundToSymbolDigits(dto.openPrice, digits);
      assertPendingVsQuote(placement.pendingKind, entry, price.bid, price.ask);
    }
    this.assertStops(
      placement.direction,
      entry,
      dto.stopLoss,
      dto.takeProfit,
    );
    await this.assertOperatorRisk(userId, {
      entry,
      stopLoss: dto.stopLoss,
      volume,
      contractSize: spec.contractSize,
    });
    const opener = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        displayName: true,
        email: true,
        soloTradeComment: true,
      },
    });
    const chosenRaw = dto.comment?.trim() || opener?.soloTradeComment || null;
    const comment = buildSoloOpenComment({
      userId,
      displayName: opener?.displayName,
      email: opener?.email,
      chosen: chosenRaw,
    });
    const placed = placement.pendingKind
      ? await this.metaApi.placePendingOrder({
          account: ctx.account,
          symbol,
          orderKind: placement.pendingKind,
          volume,
          openPrice: entry,
          stopLoss: dto.stopLoss,
          takeProfit: dto.takeProfit,
          comment,
          price,
          specDigits: spec.digits,
        })
      : await this.metaApi.placeMarketOrder({
          account: ctx.account,
          symbol,
          direction: placement.direction,
          volume,
          stopLoss: dto.stopLoss,
          takeProfit: dto.takeProfit,
          comment,
          price,
          specDigits: spec.digits,
        });
    const trade = placed.trade;
    const preferred = sanitizeSoloCommentPart(chosenRaw || '');
    if (preferred) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { soloTradeComment: preferred },
      }).catch(() => undefined);
    }
    await this.traders?.recordOpen({
      userId,
      positionId: trade.positionId,
      orderId: trade.orderId,
      comment,
    });
    return {
      status: 'placed',
      signalId: trade.positionId ?? trade.orderId ?? symbol,
      symbol,
      direction: placement.direction,
      entryPrice: entry,
      stopLoss: dto.stopLoss,
      takeProfit: dto.takeProfit,
      pending: Boolean(placement.pendingKind || (trade.orderId && !trade.positionId)),
      quote: price,
      risk: {
        volume,
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

  private async assertOperatorRisk(
    userId: string,
    input: {
      entry: number;
      stopLoss: number;
      volume: number;
      contractSize: number;
    },
  ) {
    const risk = await this.traders?.loadOperatorRisk(userId);
    if (!risk?.isOperator || risk.isPlatformAdmin) return;
    if (!Number.isFinite(input.stopLoss) || input.stopLoss <= 0) {
      throw new BadRequestException('A stop loss is required for your risk cap');
    }
    const dist = Math.abs(input.entry - input.stopLoss);
    const contract = input.contractSize > 0 ? input.contractSize : 100000;
    const riskAmount = dist * input.volume * contract;
    const ctx = await this.requireAccount(userId);
    let equity = tradingCapitalLockUsdt();
    try {
      const info = await this.metaApi.getAccountInformation(ctx.account);
      equity = Number(info.equity || info.balance || 0) || equity;
    } catch {
      /* keep lock fallback */
    }
    const pct = equity > 0 ? (riskAmount / equity) * 100 : 100;
    if (pct > risk.maxRiskPercent + 0.0001) {
      throw new BadRequestException(
        `This order risks about ${pct.toFixed(2)}% of equity. Your max is ${risk.maxRiskPercent}%. Reduce volume or tighten the stop.`,
      );
    }
  }

  async modifyStops(
    userId: string,
    positionId: string,
    dto: ModifyMt5PositionStopsDto,
  ) {
    await this.assertCanManageTrades(userId);
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
      await this.assertOwnsOpen(userId, pos.id, pos.comment ?? pos.clientId);
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
    await this.assertOwnsOpen(userId, order.id, order.comment ?? order.clientId);
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
    await this.assertCanManageTrades(userId);
    return this.withCloud(userId, () => this.loadClosePosition(userId, positionId));
  }

  async partialClose(
    userId: string,
    positionId: string,
    dto: PartialCloseMt5PositionDto,
  ) {
    await this.assertCanManageTrades(userId);
    return this.withCloud(userId, () =>
      this.loadPartialClose(userId, positionId, dto),
    );
  }

  async setBreakeven(userId: string, positionId: string) {
    await this.assertCanManageTrades(userId);
    return this.withCloud(userId, () =>
      this.loadSetBreakeven(userId, positionId),
    );
  }

  private roundVolume(
    volume: number,
    spec: { volumeStep: number; minVolume: number; maxVolume: number },
  ) {
    const step = spec.volumeStep > 0 ? spec.volumeStep : 0.01;
    const min = spec.minVolume > 0 ? spec.minVolume : step;
    const max = spec.maxVolume > 0 ? spec.maxVolume : volume;
    const steps = Math.round(volume / step);
    const rounded = Number((steps * step).toFixed(8));
    if (rounded < min) return min;
    if (rounded > max) return max;
    return rounded;
  }

  private async loadPartialClose(
    userId: string,
    positionId: string,
    dto: PartialCloseMt5PositionDto,
  ) {
    const ctx = await this.requireAccount(userId);
    const positions = await this.metaApi.getPositions(ctx.account);
    const pos = positions.find((p) => p.id === positionId);
    if (!pos) {
      throw new NotFoundException('Open position not found');
    }
    await this.assertOwnsOpen(userId, pos.id, pos.comment ?? pos.clientId);
    const spec = await this.metaApi.getSymbolSpecification(
      ctx.account,
      pos.symbol,
    );
    let requested =
      dto.volume != null && Number.isFinite(dto.volume)
        ? dto.volume
        : dto.percent != null && Number.isFinite(dto.percent)
          ? (pos.volume * dto.percent) / 100
          : NaN;
    if (!Number.isFinite(requested) || requested <= 0) {
      throw new BadRequestException(
        'Provide volume or percent (1–100) to close',
      );
    }
    requested = this.roundVolume(requested, spec);
    if (requested >= pos.volume - spec.volumeStep / 2) {
      await this.metaApi.closePositionById(ctx.account, positionId);
      return {
        ok: true,
        positionId,
        status: 'closed',
        volume: pos.volume,
        remainingVolume: 0,
      };
    }
    await this.metaApi.closePositionPartialById(
      ctx.account,
      positionId,
      requested,
    );
    return {
      ok: true,
      positionId,
      status: 'partial',
      volume: requested,
      remainingVolume: Number((pos.volume - requested).toFixed(8)),
    };
  }

  private breakevenBlockedMessage(
    pos: MetaApiPosition,
    spec: MetaApiSymbolSpec,
    be: number,
    mark: number,
    profitDistance: number,
  ): string {
    const minDist = brokerMinStopDistance(spec);
    const sell = isSellType(pos.type);
    const stopPoints = Math.max(spec.stopsLevel ?? 0, spec.freezeLevel ?? 0, 1);
    const needed = formatStopDistance(minDist, spec, pos.symbol);
    const have = formatStopDistance(Math.max(0, profitDistance), spec, pos.symbol);
    const markLabel = sell ? 'ask' : 'bid';
    if (profitDistance <= 0) {
      return `Cannot set breakeven yet — this ${sell ? 'SELL' : 'BUY'} is not far enough in profit. The broker will not place stop loss at entry (${be}) while price (${markLabel} ${mark}) is at or against entry. Price must first move at least ${needed} in profit.`;
    }
    return `Cannot set breakeven yet — broker stop level is ${stopPoints} points. Stop loss at entry (${be}) must stay at least ${needed} away from the current ${markLabel} (${mark}). This trade has only moved ${have}. Wait until price is further in profit, then try Set B.E. again.`;
  }

  private async loadSetBreakeven(userId: string, positionId: string) {
    const ctx = await this.requireAccount(userId);
    const positions = await this.metaApi.getPositions(ctx.account);
    const pos = positions.find((p) => p.id === positionId);
    if (!pos) {
      throw new NotFoundException('Open position not found');
    }
    await this.assertOwnsOpen(userId, pos.id, pos.comment ?? pos.clientId);
    const spec = await this.metaApi.getSymbolSpecification(
      ctx.account,
      pos.symbol,
    );
    const digits = spec.digits ?? 5;
    const tick = spec.tickSize > 0 ? spec.tickSize : 10 ** -digits;
    const be = roundToSymbolDigits(pos.openPrice, digits);
    const currentSl =
      pos.stopLoss != null ? roundToSymbolDigits(pos.stopLoss, digits) : null;
    if (currentSl != null && Math.abs(currentSl - be) < tick / 2) {
      return {
        ok: true,
        positionId,
        status: 'already_set',
        stopLoss: currentSl,
        message: 'Stop loss is already at breakeven',
      };
    }

    const live = await this.metaApi.getSymbolPrice(ctx.account, pos.symbol);
    const sell = isSellType(pos.type);
    const mark = sell ? live.ask : live.bid;
    const profitDistance = sell ? be - mark : mark - be;
    const minDist = brokerMinStopDistance(spec);
    if (profitDistance + tick / 2 < minDist) {
      throw new BadRequestException(
        this.breakevenBlockedMessage(pos, spec, be, mark, profitDistance),
      );
    }

    try {
      await this.metaApi.modifyPositionStops(ctx.account, {
        positionId,
        stopLoss: be,
        takeProfit: pos.takeProfit,
        specDigits: digits,
      });
    } catch (err) {
      const raw =
        err instanceof BadRequestException
          ? Array.isArray(err.message)
            ? err.message.join(' ')
            : String(err.message)
          : err instanceof Error
            ? err.message
            : String(err);
      if (classifyBrokerError(raw) === 'invalid_stops') {
        throw new BadRequestException(
          this.breakevenBlockedMessage(pos, spec, be, mark, profitDistance),
        );
      }
      throw err instanceof BadRequestException
        ? err
        : new BadRequestException(humanizeBrokerError(raw));
    }

    return {
      ok: true,
      positionId,
      status: 'set',
      stopLoss: be,
      message: `Stop loss moved to breakeven (${be})`,
    };
  }

  private async loadClosePosition(userId: string, positionId: string) {
    const ctx = await this.requireAccount(userId);
    const positions = await this.metaApi.getPositions(ctx.account);
    const pos = positions.find((p) => p.id === positionId);
    if (pos) {
      await this.assertOwnsOpen(userId, pos.id, pos.comment ?? pos.clientId);
      await this.metaApi.closePositionById(ctx.account, positionId);
      void this.settleSoon(userId);
      return { ok: true, positionId, status: 'closed' };
    }
    const orders = await this.metaApi.getOrders(ctx.account);
    const order = orders.find((o) => o.id === positionId);
    if (order) {
      await this.assertOwnsOpen(userId, order.id, order.comment ?? order.clientId);
      await this.metaApi.cancelPendingOrder(ctx.account, positionId);
      return { ok: true, positionId, status: 'cancelled' };
    }
    throw new NotFoundException('Position or pending order not found');
  }

  async closeAll(userId: string) {
    await this.assertCanManageTrades(userId);
    return this.withCloud(userId, () => this.loadCloseAll(userId));
  }

  private async loadCloseAll(userId: string) {
    const ctx = await this.requireAccount(userId);
    const positions = await this.onlyOwnPositions(
      userId,
      await this.metaApi.getPositions(ctx.account),
    );
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
    void this.settleSoon(userId);
    return { ok: true, results };
  }

  private async settleSoon(userId: string) {
    try {
      await this.loadHistory(userId, true, 2);
    } catch (err) {
      this.logger.warn(
        `Solo P&L settle failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
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
    const items = (
      await this.onlyOwnHistory(
        userId,
        this.mapClosedDeals(deals).filter((row) =>
          isAfterSoloMt5HistoryReset(row.closedAt),
        ),
        deals,
      )
    );
    await this.traders?.settleClosedDeals(deals);
    this.logger.log(
      `Solo MT5 history deals=${deals.length} closed=${items.length}`,
    );
    return {
      items,
      count: items.length,
      dealCount: deals.length,
      dayPnl: items.reduce((sum, row) => sum + (row.pnl ?? 0), 0),
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

  private async onlyOwnPositions(
    userId: string,
    positions: MetaApiPosition[],
  ): Promise<MetaApiPosition[]> {
    const scope = await this.traders?.tradeScope(userId);
    if (!scope?.isolate) return positions;
    return positions.filter((p) =>
      scope.owns(p.id, p.comment ?? p.clientId),
    );
  }

  private async onlyOwnOrders(
    userId: string,
    orders: MetaApiOrder[],
  ): Promise<MetaApiOrder[]> {
    const scope = await this.traders?.tradeScope(userId);
    if (!scope?.isolate) return orders;
    return orders.filter((o) => scope.owns(o.id, o.comment ?? o.clientId));
  }

  private async onlyOwnHistory(
    userId: string,
    items: Array<{ id: string; signalId: string }>,
    deals: MetaApiDeal[],
  ) {
    const scope = await this.traders?.tradeScope(userId);
    if (!scope?.isolate) return items;
    const comments = new Map<string, string>();
    for (const d of deals) {
      const key = d.positionId || d.id;
      if (d.comment) comments.set(key, d.comment);
    }
    return items.filter(
      (row) =>
        scope.owns(row.signalId, comments.get(row.signalId)) ||
        scope.owns(row.id, comments.get(row.id)),
    );
  }

  private async assertCanManageTrades(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, soloTradeOperator: true },
    });
    assertSoloCanManageTrades(user?.email, {
      soloTradeOperator: user?.soloTradeOperator,
    });
  }

  private async assertOwnsOpen(
    userId: string,
    id: string,
    comment?: string | null,
  ) {
    const scope = await this.traders?.tradeScope(userId);
    if (!scope?.isolate) return;
    if (scope.owns(id, comment)) return;
    throw new NotFoundException('Position or pending order not found');
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
      canSetBreakeven: true,
      executionLabel: pos.comment?.trim() || 'Your live trade',
      comment: pos.comment ?? null,
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
      executionLabel: order.comment?.trim() || 'Pending on your linked MT5',
      comment: order.comment ?? null,
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
    const ownerId = await this.ownerUserId(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
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
