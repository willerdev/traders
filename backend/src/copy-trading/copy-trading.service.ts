import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CopyTradeStatus, TradeDirection } from '@prisma/client';
import { RISK_PERCENT } from '../common/constants';
import { currentWeekYear } from '../common/week.util';
import {
  computeEntryMid,
  computeOneToOnePrice,
  computeTwoToOnePrice,
  priceReachedOneToOne,
} from '../common/rr.util';
import { NotificationService } from '../email/notification.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import {
  buildCopyTradeIdentifiers,
  MetaApiPendingAction,
  resolvePendingOrderType,
  roundToSymbolDigits,
} from '../metaapi/metaapi-order.util';
import { MetaApiService } from '../metaapi/metaapi.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfitShareService } from '../profit-share/profit-share.service';
import { CopyTradeRiskService } from './copy-trade-risk.service';

const DEFAULT_COPY_NOTIFY_EMAIL = 'willeratmit12@gmail.com';

export type CopyMirrorInput = {
  signalDbId: string;
  signalPublicId: string;
  sourceUserId: string;
  sourceDisplayName: string;
  symbol: string;
  direction: TradeDirection;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  openPrice: number;
  pending: boolean;
  orderKind?: string;
};

export type CopyTargetLeader = {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  tier: string;
  winRate: number;
  profit: number;
  source: 'pool' | 'auto';
  platformWinRate?: number;
  platformTotalTrades?: number;
  copyTradesTotal?: number;
  copyTradesClosed?: number;
  copyWinRate?: number | null;
  copyTotalProfit?: number;
};

export type CopyPoolTraderRow = {
  userId: string;
  displayName: string;
  addedAt: string;
  addedById: string | null;
  rank: number | null;
  tier: string | null;
  score: number | null;
  winRate: number | null;
  profit: number | null;
};

export type CopyPoolHealth = {
  ready: boolean;
  message: string;
  checkedAt: string;
  copyAccountId: string | null;
  accountConnected: boolean;
  tradeAllowed: boolean;
  leaderCount: number;
};

@Injectable()
export class CopyTradingService {
  private readonly logger = new Logger(CopyTradingService.name);

  constructor(
    private prisma: PrismaService,
    private metaApi: MetaApiService,
    private copyTradeRisk: CopyTradeRiskService,
    private leaderboard: LeaderboardService,
    private profitShare: ProfitShareService,
    private notifications: NotificationService,
  ) {}

  private async getCopyConfig() {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
      select: {
        copyRiskPercent: true,
        copyNotifyEmail: true,
        copyUseTwoToOneRr: true,
        copyAutoBreakevenEnabled: true,
        copyEmailAlertsEnabled: true,
        copyHealthReady: true,
        copyHealthMessage: true,
        copyHealthCheckedAt: true,
      },
    });
    const riskPercent = Number(config?.copyRiskPercent ?? RISK_PERCENT);
    const notifyEmail =
      config?.copyNotifyEmail?.trim().toLowerCase() || DEFAULT_COPY_NOTIFY_EMAIL;
    return {
      riskPercent:
        Number.isFinite(riskPercent) && riskPercent > 0
          ? riskPercent
          : RISK_PERCENT,
      notifyEmail,
      copyUseTwoToOneRr: config?.copyUseTwoToOneRr ?? true,
      copyAutoBreakevenEnabled: config?.copyAutoBreakevenEnabled ?? true,
      copyEmailAlertsEnabled: config?.copyEmailAlertsEnabled ?? true,
      copyHealthReady: config?.copyHealthReady ?? false,
      copyHealthMessage: config?.copyHealthMessage ?? null,
      copyHealthCheckedAt: config?.copyHealthCheckedAt?.toISOString() ?? null,
    };
  }

  async getCopySettings() {
    const cfg = await this.getCopyConfig();
    return {
      copyRiskPercent: cfg.riskPercent,
      copyNotifyEmail: cfg.notifyEmail,
      copyUseTwoToOneRr: cfg.copyUseTwoToOneRr,
      copyAutoBreakevenEnabled: cfg.copyAutoBreakevenEnabled,
      copyEmailAlertsEnabled: cfg.copyEmailAlertsEnabled,
      copyHealthReady: cfg.copyHealthReady,
      copyHealthMessage: cfg.copyHealthMessage,
      copyHealthCheckedAt: cfg.copyHealthCheckedAt,
    };
  }

  async updateCopySettings(input: {
    copyRiskPercent?: number;
    copyNotifyEmail?: string;
    copyUseTwoToOneRr?: boolean;
    copyAutoBreakevenEnabled?: boolean;
    copyEmailAlertsEnabled?: boolean;
  }) {
    const data: {
      copyRiskPercent?: number;
      copyNotifyEmail?: string;
      copyUseTwoToOneRr?: boolean;
      copyAutoBreakevenEnabled?: boolean;
      copyEmailAlertsEnabled?: boolean;
    } = {};

    if (input.copyRiskPercent !== undefined) {
      if (input.copyRiskPercent <= 0 || input.copyRiskPercent > 100) {
        throw new BadRequestException(
          'Copy risk percent must be between 0.1 and 100',
        );
      }
      data.copyRiskPercent = input.copyRiskPercent;
    }
    if (input.copyNotifyEmail !== undefined) {
      const email = input.copyNotifyEmail.trim().toLowerCase();
      if (!email) {
        throw new BadRequestException('Copy notify email is required');
      }
      data.copyNotifyEmail = email;
    }
    if (input.copyUseTwoToOneRr !== undefined) {
      data.copyUseTwoToOneRr = input.copyUseTwoToOneRr;
    }
    if (input.copyAutoBreakevenEnabled !== undefined) {
      data.copyAutoBreakevenEnabled = input.copyAutoBreakevenEnabled;
    }
    if (input.copyEmailAlertsEnabled !== undefined) {
      data.copyEmailAlertsEnabled = input.copyEmailAlertsEnabled;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });

    return this.getCopySettings();
  }

  async evaluateCopyPoolHealth(): Promise<CopyPoolHealth> {
    const checkedAt = new Date().toISOString();
    const leaders = await this.getActiveCopyTargets();

    if (!this.metaApi.isConfigured) {
      return {
        ready: false,
        message: 'MetaAPI is not configured',
        checkedAt,
        copyAccountId: null,
        accountConnected: false,
        tradeAllowed: false,
        leaderCount: leaders.length,
      };
    }

    const copyAccountId = await this.metaApi.resolveCopyAccountIdAsync();
    if (!copyAccountId) {
      return {
        ready: false,
        message: 'No copy MT5 account is available',
        checkedAt,
        copyAccountId: null,
        accountConnected: false,
        tradeAllowed: false,
        leaderCount: leaders.length,
      };
    }

    if (leaders.length === 0) {
      return {
        ready: false,
        message: 'No traders in the copy pool — add traders or wait for weekly top 3',
        checkedAt,
        copyAccountId,
        accountConnected: false,
        tradeAllowed: false,
        leaderCount: 0,
      };
    }

    try {
      const account = await this.metaApi.getAccount(copyAccountId);
      const connected =
        account.state === 'DEPLOYED' &&
        account.connectionStatus === 'CONNECTED';

      if (!connected) {
        return {
          ready: false,
          message: `Copy account not connected (${account.connectionStatus}, ${account.state})`,
          checkedAt,
          copyAccountId,
          accountConnected: false,
          tradeAllowed: false,
          leaderCount: leaders.length,
        };
      }

      const terminal = await this.metaApi.getTerminalState(copyAccountId);
      const tradeAllowed = terminal.information?.tradeAllowed ?? false;

      if (!tradeAllowed) {
        return {
          ready: false,
          message: 'Copy account is connected but trading is disabled by the broker',
          checkedAt,
          copyAccountId,
          accountConnected: true,
          tradeAllowed: false,
          leaderCount: leaders.length,
        };
      }

      if (terminal.error) {
        return {
          ready: false,
          message: terminal.error,
          checkedAt,
          copyAccountId,
          accountConnected: true,
          tradeAllowed: false,
          leaderCount: leaders.length,
        };
      }

      return {
        ready: true,
        message: `Ready — ${leaders.length} trader(s) mirrored at ${copyAccountId.slice(0, 8)}…`,
        checkedAt,
        copyAccountId,
        accountConnected: true,
        tradeAllowed: true,
        leaderCount: leaders.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ready: false,
        message,
        checkedAt,
        copyAccountId,
        accountConnected: false,
        tradeAllowed: false,
        leaderCount: leaders.length,
      };
    }
  }

  async runCopyPoolHealthCheck(): Promise<CopyPoolHealth> {
    const previous = await this.getCopyConfig();
    const health = await this.evaluateCopyPoolHealth();

    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        copyHealthReady: health.ready,
        copyHealthMessage: health.message,
        copyHealthCheckedAt: new Date(health.checkedAt),
      },
      update: {
        copyHealthReady: health.ready,
        copyHealthMessage: health.message,
        copyHealthCheckedAt: new Date(health.checkedAt),
      },
    });

    if (previous.copyHealthReady && !health.ready) {
      this.notifications.copyTradeBlocked(previous.notifyEmail, {
        signalId: 'health-check',
        sourceName: 'Copy pool',
        symbol: '—',
        direction: '—',
        reason: `Copy pool is NOT ready to receive trades: ${health.message}`,
        riskPercent: previous.riskPercent,
      });
      this.logger.warn(`Copy pool health degraded: ${health.message}`);
    } else if (!previous.copyHealthReady && health.ready) {
      this.logger.log(`Copy pool health restored: ${health.message}`);
    } else if (!health.ready) {
      this.logger.debug(`Copy pool not ready: ${health.message}`);
    }

    return health;
  }

  async manageCopyTradeBreakeven(): Promise<{ checked: number; applied: number }> {
    const { copyAutoBreakevenEnabled, notifyEmail, copyEmailAlertsEnabled } =
      await this.getCopyConfig();
    if (!copyAutoBreakevenEnabled) return { checked: 0, applied: 0 };

    const copyAccountId = await this.metaApi.resolveCopyAccountIdAsync();
    if (!this.metaApi.isConfigured || !copyAccountId) {
      return { checked: 0, applied: 0 };
    }

    const openRows = await this.prisma.copyTrade.findMany({
      where: {
        copyAccountId,
        status: CopyTradeStatus.OPEN,
        breakevenApplied: false,
        metaApiPositionId: { not: null },
      },
      include: {
        signal: {
          select: { entryMin: true, entryMax: true, signalId: true },
        },
      },
    });
    if (openRows.length === 0) return { checked: 0, applied: 0 };

    let account;
    try {
      account = await this.metaApi.ensureAccountReady(copyAccountId);
    } catch (err) {
      this.logger.warn(
        `Copy breakeven skipped — account not ready: ${err instanceof Error ? err.message : err}`,
      );
      return { checked: 0, applied: 0 };
    }

    let applied = 0;
    for (const row of openRows) {
      try {
        const entryMin = Number(row.signal.entryMin);
        const entryMax = Number(row.signal.entryMax);
        const sl = Number(row.stopLoss);
        const tp1 =
          row.tp1Price != null
            ? Number(row.tp1Price)
            : computeOneToOnePrice(row.direction, entryMin, entryMax, sl);

        const price = await this.metaApi.getSymbolPrice(account, row.symbol);
        const mark = row.direction === 'BUY' ? price.bid : price.ask;
        if (!priceReachedOneToOne(row.direction, tp1, mark)) continue;

        const breakeven =
          row.entryPrice != null
            ? Number(row.entryPrice)
            : computeEntryMid(entryMin, entryMax);

        const spec = await this.metaApi.getSymbolSpecification(
          account,
          row.symbol,
        );
        const digits = spec.digits ?? 5;
        const roundedBe = roundToSymbolDigits(breakeven, digits);

        await this.metaApi.modifyPositionStops(account, {
          positionId: row.metaApiPositionId!,
          stopLoss: roundedBe,
          specDigits: digits,
        });

        await this.prisma.copyTrade.update({
          where: { id: row.id },
          data: {
            breakevenApplied: true,
            notes: `${row.notes ?? ''} | TP1 (1:1) hit — SL moved to breakeven @ ${roundedBe}`.slice(
              0,
              500,
            ),
          },
        });
        applied += 1;
        this.logger.log(
          `Copy breakeven set for ${row.signal.signalId} @ ${roundedBe}`,
        );

        if (copyEmailAlertsEnabled) {
          this.notifications.copyBreakevenHit(notifyEmail, {
            signalId: row.signal.signalId,
            symbol: row.symbol,
            direction: row.direction,
            entryPrice: breakeven,
            tp1Price: tp1,
            breakevenStop: roundedBe,
            volume: row.volume != null ? Number(row.volume) : null,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Copy breakeven failed for ${row.signal.signalId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { checked: openRows.length, applied };
  }

  private async failCopyMirror(input: {
    existingJournalId?: string;
    signalDbId: string;
    sourceUserId: string;
    sourceRank: number;
    copyAccountId: string;
    symbol: string;
    direction: TradeDirection;
    stopLoss: number;
    takeProfit: number;
    entryPrice: number;
    sourceDisplayName: string;
    reason: string;
    notifyEmail: string;
    riskPercent: number;
    signalPublicId: string;
  }) {
    let journalId = input.existingJournalId;
    if (journalId) {
      await this.prisma.copyTrade.update({
        where: { id: journalId },
        data: {
          status: CopyTradeStatus.SKIPPED,
          notes: input.reason.slice(0, 500),
        },
      });
    } else {
      const row = await this.prisma.copyTrade.create({
        data: {
          signalId: input.signalDbId,
          sourceUserId: input.sourceUserId,
          sourceRank: input.sourceRank,
          copyAccountId: input.copyAccountId,
          symbol: input.symbol,
          direction: input.direction,
          stopLoss: input.stopLoss,
          takeProfit: input.takeProfit,
          entryPrice: input.entryPrice,
          status: CopyTradeStatus.SKIPPED,
          notes: input.reason.slice(0, 500),
        },
      });
      journalId = row.id;
    }

    this.notifications.copyTradeBlocked(input.notifyEmail, {
      signalId: input.signalPublicId,
      sourceName: input.sourceDisplayName,
      symbol: input.symbol,
      direction: input.direction,
      reason: input.reason,
      riskPercent: input.riskPercent,
    });

    this.logger.warn(
      `Copy trade blocked for ${input.signalPublicId}: ${input.reason}`,
    );

    return journalId;
  }

  async getTopLeaders(limit = 3) {
    const { weekNumber, year } = currentWeekYear();
    const rows = await this.leaderboard.getLeaderboard(weekNumber, year, limit);
    return rows.map((row) => ({
      rank: row.rank,
      userId: row.userId,
      displayName: row.displayName,
      score: row.score,
      tier: row.tier,
      winRate: Number(row.winRate),
      profit: Number(row.profit),
    }));
  }

  async getWeeklyLeaderboard(limit = 25) {
    return this.getTopLeaders(limit);
  }

  async listPoolTraders(): Promise<CopyPoolTraderRow[]> {
    const rows = await this.prisma.copyPoolTrader.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { displayName: true } },
      },
    });
    if (rows.length === 0) return [];

    const { weekNumber, year } = currentWeekYear();
    const leaderboard = await this.leaderboard.getLeaderboard(
      weekNumber,
      year,
      100,
    );
    const leaderboardByUser = new Map(
      leaderboard.map((row) => [row.userId, row]),
    );

    return rows.map((row) => {
      const lb = leaderboardByUser.get(row.userId);
      return {
        userId: row.userId,
        displayName: row.user.displayName,
        addedAt: row.createdAt.toISOString(),
        addedById: row.addedById,
        rank: lb?.rank ?? null,
        tier: lb?.tier ?? null,
        score: lb?.score ?? null,
        winRate: lb != null ? Number(lb.winRate) : null,
        profit: lb != null ? Number(lb.profit) : null,
      };
    });
  }

  async addPoolTrader(userId: string, adminId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true },
    });
    if (!user) {
      throw new NotFoundException('Trader not found');
    }

    await this.prisma.copyPoolTrader.upsert({
      where: { userId },
      create: {
        userId,
        addedById: adminId ?? null,
      },
      update: {},
    });

    this.logger.log(`Copy pool: added ${user.displayName} (${userId})`);

    return {
      ok: true,
      poolTraders: await this.listPoolTraders(),
      leaders: await this.enrichLeadersWithCopyStats(
        await this.getActiveCopyTargets(),
        await this.metaApi.resolveCopyAccountIdAsync(),
      ),
    };
  }

  async removePoolTrader(userId: string) {
    const existing = await this.prisma.copyPoolTrader.findUnique({
      where: { userId },
      include: { user: { select: { displayName: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Trader is not in the copy pool');
    }

    await this.prisma.copyPoolTrader.delete({ where: { userId } });

    this.logger.log(
      `Copy pool: removed ${existing.user.displayName} (${userId})`,
    );

    return {
      ok: true,
      poolTraders: await this.listPoolTraders(),
      leaders: await this.enrichLeadersWithCopyStats(
        await this.getActiveCopyTargets(),
        await this.metaApi.resolveCopyAccountIdAsync(),
      ),
    };
  }

  async getActiveCopyTargets(): Promise<CopyTargetLeader[]> {
    const pool = await this.prisma.copyPoolTrader.findMany({
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { displayName: true } } },
    });

    if (pool.length > 0) {
      const { weekNumber, year } = currentWeekYear();
      const leaderboard = await this.leaderboard.getLeaderboard(
        weekNumber,
        year,
        100,
      );
      const leaderboardByUser = new Map(
        leaderboard.map((row) => [row.userId, row]),
      );

      return pool.map((entry, index) => {
        const row = leaderboardByUser.get(entry.userId);
        if (row) {
          return {
            rank: row.rank,
            userId: entry.userId,
            displayName: row.displayName,
            score: row.score,
            tier: row.tier,
            winRate: Number(row.winRate),
            profit: Number(row.profit),
            source: 'pool' as const,
          };
        }

        return {
          rank: index + 1,
          userId: entry.userId,
          displayName: entry.user.displayName,
          score: 0,
          tier: '—',
          winRate: 0,
          profit: 0,
          source: 'pool' as const,
        };
      });
    }

    const leaders = await this.getTopLeaders(3);
    return leaders.map((leader) => ({ ...leader, source: 'auto' as const }));
  }

  private async resolveSourceRank(
    userId: string,
  ): Promise<{ rank: number; displayName: string } | null> {
    const leaders = await this.getActiveCopyTargets();
    const match = leaders.find((l) => l.userId === userId);
    if (!match) return null;
    return { rank: match.rank, displayName: match.displayName };
  }

  async maybeMirrorTrade(input: CopyMirrorInput): Promise<void> {
    const copyAccountId = await this.metaApi.resolveCopyAccountIdAsync();
    if (!this.metaApi.isConfigured || !copyAccountId) return;

    const health = await this.evaluateCopyPoolHealth();
    if (!health.ready) {
      this.logger.debug(
        `Copy skip ${input.signalPublicId}: pool not ready — ${health.message}`,
      );
      return;
    }

    const { riskPercent, notifyEmail, copyUseTwoToOneRr, copyEmailAlertsEnabled } =
      await this.getCopyConfig();

    const existing = await this.prisma.copyTrade.findUnique({
      where: { signalId: input.signalDbId },
    });
    if (
      existing &&
      existing.status !== CopyTradeStatus.FAILED
    ) {
      return;
    }

    const source = await this.resolveSourceRank(input.sourceUserId);
    if (!source) {
      this.logger.debug(
        `Copy skip ${input.signalPublicId}: trader not in copy pool`,
      );
      return;
    }

    const sl = input.stopLoss;
    const tp1 = computeOneToOnePrice(
      input.direction,
      input.entryMin,
      input.entryMax,
      sl,
    );
    const tp = copyUseTwoToOneRr
      ? computeTwoToOnePrice(
          input.direction,
          input.entryMin,
          input.entryMax,
          sl,
        )
      : input.takeProfit;
    const openPrice = input.openPrice;

    let journal = existing;
    let account;
    let sizing;

    try {
      account = await this.metaApi.getAccount(copyAccountId);
      sizing = await this.copyTradeRisk.calculateCopyPositionSize({
        account,
        symbol: input.symbol,
        direction: input.direction,
        stopLoss: sl,
        takeProfit: tp,
        entryPrice: openPrice,
        riskPercent,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.failCopyMirror({
        existingJournalId: journal?.id,
        signalDbId: input.signalDbId,
        sourceUserId: input.sourceUserId,
        sourceRank: source.rank,
        copyAccountId,
        symbol: input.symbol,
        direction: input.direction,
        stopLoss: sl,
        takeProfit: tp,
        entryPrice: openPrice,
        sourceDisplayName: source.displayName,
        reason: message,
        notifyEmail,
        riskPercent,
        signalPublicId: input.signalPublicId,
      });
      return;
    }

    if (!journal) {
      journal = await this.prisma.copyTrade.create({
        data: {
          signalId: input.signalDbId,
          sourceUserId: input.sourceUserId,
          sourceRank: source.rank,
          copyAccountId,
          symbol: input.symbol,
          direction: input.direction,
          stopLoss: sl,
          takeProfit: tp,
          tp1Price: tp1,
          entryPrice: openPrice,
          status: CopyTradeStatus.PENDING,
          notes: `Mirroring #${source.rank} ${source.displayName} (max ${riskPercent}% risk${copyUseTwoToOneRr ? ', 1:2 RR TP' : ''})`,
        },
      });
    } else {
      await this.prisma.copyTrade.update({
        where: { id: journal.id },
        data: {
          status: CopyTradeStatus.PENDING,
          takeProfit: tp,
          tp1Price: tp1,
          notes: `Retry mirroring #${source.rank} ${source.displayName} (max ${riskPercent}% risk${copyUseTwoToOneRr ? ', 1:2 RR TP' : ''})`,
        },
      });
    }

    try {
      const price = await this.metaApi.getSymbolPrice(account, input.symbol);
      const spec = await this.metaApi.getSymbolSpecification(
        account,
        input.symbol,
      );
      const digits = spec.digits ?? 5;
      const roundedTp = roundToSymbolDigits(tp, digits);
      const marketPrice =
        input.direction === 'BUY' ? price.ask : price.bid;

      const { comment, clientId } = buildCopyTradeIdentifiers({
        sourceDisplayName: input.sourceDisplayName,
        sourceUserId: input.sourceUserId,
        signalId: input.signalPublicId,
        symbol: input.symbol,
      });

      let tradeResult;
      let orderType = input.pending ? 'pending' : 'market';
      if (input.pending) {
        const orderKind = (input.orderKind ??
          resolvePendingOrderType(
            input.direction,
            openPrice,
            marketPrice,
          )) as MetaApiPendingAction;
        orderType = orderKind;
        const roundedPrice = roundToSymbolDigits(openPrice, digits);
        const { trade } = await this.metaApi.placePendingOrder({
          account,
          symbol: input.symbol,
          orderKind,
          openPrice: roundedPrice,
          volume: sizing.volume,
          stopLoss: sl,
          takeProfit: roundedTp,
          comment,
          clientId,
          price,
          specDigits: digits,
        });
        tradeResult = trade;
      } else {
        const placed = await this.metaApi.placeOrderWithFallback({
          account,
          symbol: input.symbol,
          direction: input.direction,
          volume: sizing.volume,
          stopLoss: sl,
          takeProfit: roundedTp,
          entryMin: input.entryMin,
          entryMax: input.entryMax,
          comment,
          clientId,
          price,
          specDigits: digits,
          recalculateVolume: async (pendingOpen) => {
            const next = await this.copyTradeRisk.calculateCopyPositionSize({
              account,
              symbol: input.symbol,
              direction: input.direction,
              stopLoss: sl,
              takeProfit: tp,
              riskPercent,
              entryPrice: pendingOpen,
            });
            return next.volume;
          },
        });
        tradeResult = placed.trade;
        orderType = placed.orderKind ?? 'market';
      }

      const riskNote = sizing.pairAdjustments.join(' | ');
      const now = new Date();
      await this.prisma.copyTrade.update({
        where: { id: journal.id },
        data: {
          status: CopyTradeStatus.OPEN,
          volume: sizing.volume,
          entryPrice: openPrice,
          metaApiOrderId: tradeResult.orderId ?? null,
          metaApiPositionId:
            tradeResult.positionId ?? tradeResult.orderId ?? null,
          executedAt: now,
          notes: `Copied #${source.rank} ${source.displayName} @ ${riskPercent}% cap (${sizing.volume} lots, est. SL loss ${sizing.estimatedLossAtSl.toFixed(2)} ${sizing.currency}). ${riskNote}`,
        },
      });

      if (copyEmailAlertsEnabled) {
        this.notifications.copyTradePlaced(notifyEmail, {
          signalId: input.signalPublicId,
          sourceName: source.displayName,
          sourceRank: source.rank,
          symbol: input.symbol,
          direction: input.direction,
          volume: sizing.volume,
          entryPrice: openPrice,
          stopLoss: sl,
          takeProfit: tp,
          riskPercent,
          riskCapAmount: sizing.riskCapAmount,
          estimatedLossAtSl: sizing.estimatedLossAtSl,
          currency: sizing.currency,
          orderType,
          pairAdjustments: sizing.pairAdjustments,
        });
      }

      this.logger.log(
        `Copy trade placed for ${input.signalPublicId} from rank #${source.rank} (${sizing.volume} lots, ${riskPercent}% cap)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.copyTrade.update({
        where: { id: journal.id },
        data: {
          status: CopyTradeStatus.FAILED,
          notes: message.slice(0, 500),
        },
      });
      this.logger.warn(
        `Copy trade failed for ${input.signalPublicId}: ${message}`,
      );
    }
  }

  private async enrichLeadersWithCopyStats(
    leaders: CopyTargetLeader[],
    copyAccountId: string | null,
  ): Promise<CopyTargetLeader[]> {
    if (leaders.length === 0) return leaders;

    const userIds = leaders.map((l) => l.userId);
    const [virtualAccounts, copyRows] = await Promise.all([
      this.prisma.virtualAccount.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          winRate: true,
          totalTrades: true,
          winningTrades: true,
        },
      }),
      copyAccountId
        ? this.prisma.copyTrade.findMany({
            where: {
              copyAccountId,
              sourceUserId: { in: userIds },
            },
            select: {
              sourceUserId: true,
              status: true,
              profit: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const virtualByUser = new Map(
      virtualAccounts.map((row) => [row.userId, row]),
    );
    const copyByUser = new Map<
      string,
      { total: number; closed: number; wins: number; profit: number }
    >();

    for (const row of copyRows) {
      const bucket = copyByUser.get(row.sourceUserId) ?? {
        total: 0,
        closed: 0,
        wins: 0,
        profit: 0,
      };
      bucket.total += 1;
      if (row.status === 'CLOSED') {
        bucket.closed += 1;
        const p = Number(row.profit ?? 0);
        bucket.profit += p;
        if (p > 0) bucket.wins += 1;
      }
      copyByUser.set(row.sourceUserId, bucket);
    }

    return leaders.map((leader) => {
      const virtual = virtualByUser.get(leader.userId);
      const copy = copyByUser.get(leader.userId);
      return {
        ...leader,
        platformWinRate:
          virtual != null ? Number(virtual.winRate) : undefined,
        platformTotalTrades: virtual?.totalTrades,
        copyTradesTotal: copy?.total ?? 0,
        copyTradesClosed: copy?.closed ?? 0,
        copyWinRate:
          copy && copy.closed > 0 ? copy.wins / copy.closed : null,
        copyTotalProfit: copy?.profit ?? 0,
      };
    });
  }

  async getCopyDashboard(options?: { includeTerminal?: boolean }) {
    const includeTerminal = options?.includeTerminal !== false;
    const copyAccountId = await this.metaApi.resolveCopyAccountIdAsync();
    const explicitCopyId = this.metaApi.getConfiguredCopyAccountId();
    const [leaders, poolTraders, weeklyLeaderboard, copySettings] =
      await Promise.all([
      this.getActiveCopyTargets(),
      this.listPoolTraders(),
      this.getWeeklyLeaderboard(25),
      this.getCopySettings(),
    ]);
    const poolMode = poolTraders.length > 0 ? 'manual' : 'auto';
    const leadersWithStats = await this.enrichLeadersWithCopyStats(
      leaders,
      copyAccountId,
    );

    if (!this.metaApi.isConfigured || !copyAccountId) {
      return {
        configured: false,
        copyAccountId: null,
        message:
          'No MetaAPI trading account available — connect an account in MetaAPI first',
        poolMode,
        poolTraders,
        weeklyLeaderboard,
        copyRiskPercent: copySettings.copyRiskPercent,
        copyNotifyEmail: copySettings.copyNotifyEmail,
        copyUseTwoToOneRr: copySettings.copyUseTwoToOneRr,
        copyAutoBreakevenEnabled: copySettings.copyAutoBreakevenEnabled,
        copyEmailAlertsEnabled: copySettings.copyEmailAlertsEnabled,
        copyHealth: {
          ready: copySettings.copyHealthReady,
          message: copySettings.copyHealthMessage,
          checkedAt: copySettings.copyHealthCheckedAt,
        },
        riskPercent: copySettings.copyRiskPercent,
        leaders: leadersWithStats,
        terminal: null,
        journal: [],
        stats: {
          openCount: 0,
          closedCount: 0,
          totalRealizedProfit: 0,
          floatingProfit: 0,
        },
      };
    }

    const journalRows = await this.prisma.copyTrade.findMany({
      where: { copyAccountId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        sourceUser: { select: { displayName: true } },
        signal: { select: { signalId: true, status: true } },
      },
    });

    if (!includeTerminal) {
      const journal = journalRows.map((row) => ({
        id: row.id,
        signalId: row.signal.signalId,
        sourceRank: row.sourceRank,
        sourceName: row.sourceUser.displayName,
        symbol: row.symbol,
        direction: row.direction,
        volume: row.volume != null ? Number(row.volume) : null,
        entryPrice: row.entryPrice != null ? Number(row.entryPrice) : null,
        stopLoss: Number(row.stopLoss),
        takeProfit: Number(row.takeProfit),
        status: row.status,
        profit: row.profit != null ? Number(row.profit) : null,
        notes: row.notes,
        executedAt: row.executedAt,
        closedAt: row.closedAt,
        createdAt: row.createdAt,
      }));

      const openCount = journal.filter((j) => j.status === 'OPEN').length;
      const closedCount = journal.filter((j) => j.status === 'CLOSED').length;
      const totalRealizedProfit = journal
        .filter((j) => j.status === 'CLOSED' && j.profit != null)
        .reduce((sum, j) => sum + (j.profit ?? 0), 0);

      return {
        configured: true,
        copyAccountId,
        copyAccountSource: explicitCopyId ? 'env' : 'auto',
        poolMode,
        poolTraders,
        weeklyLeaderboard,
        copyRiskPercent: copySettings.copyRiskPercent,
        copyNotifyEmail: copySettings.copyNotifyEmail,
        copyUseTwoToOneRr: copySettings.copyUseTwoToOneRr,
        copyAutoBreakevenEnabled: copySettings.copyAutoBreakevenEnabled,
        copyEmailAlertsEnabled: copySettings.copyEmailAlertsEnabled,
        copyHealth: {
          ready: copySettings.copyHealthReady,
          message: copySettings.copyHealthMessage,
          checkedAt: copySettings.copyHealthCheckedAt,
        },
        riskPercent: copySettings.copyRiskPercent,
        leaders: leadersWithStats,
        terminal: null,
        journal,
        stats: {
          openCount,
          closedCount,
          totalRealizedProfit,
          floatingProfit: 0,
        },
      };
    }

    const terminal = await this.metaApi.getTerminalState(copyAccountId);

    const positionProfitById = new Map(
      (terminal.positions ?? []).map((p) => [p.id, p.profit + p.unrealizedProfit]),
    );

    const journal = journalRows.map((row) => {
      const liveProfit =
        row.metaApiPositionId != null
          ? positionProfitById.get(row.metaApiPositionId)
          : undefined;
      return {
        id: row.id,
        signalId: row.signal.signalId,
        sourceRank: row.sourceRank,
        sourceName: row.sourceUser.displayName,
        symbol: row.symbol,
        direction: row.direction,
        volume: row.volume != null ? Number(row.volume) : null,
        entryPrice: row.entryPrice != null ? Number(row.entryPrice) : null,
        stopLoss: Number(row.stopLoss),
        takeProfit: Number(row.takeProfit),
        status: row.status,
        profit:
          liveProfit ??
          (row.profit != null ? Number(row.profit) : null),
        notes: row.notes,
        executedAt: row.executedAt,
        closedAt: row.closedAt,
        createdAt: row.createdAt,
      };
    });

    const openCount = journal.filter((j) => j.status === 'OPEN').length;
    const closedCount = journal.filter((j) => j.status === 'CLOSED').length;
    const totalRealizedProfit = journal
      .filter((j) => j.status === 'CLOSED' && j.profit != null)
      .reduce((sum, j) => sum + (j.profit ?? 0), 0);
    const floatingProfit = (terminal.positions ?? []).reduce(
      (sum, p) => sum + p.profit + p.unrealizedProfit + p.swap + p.commission,
      0,
    );

    return {
      configured: true,
      copyAccountId,
      copyAccountSource: explicitCopyId ? 'env' : 'auto',
      poolMode,
      poolTraders,
      weeklyLeaderboard,
      copyRiskPercent: copySettings.copyRiskPercent,
      copyNotifyEmail: copySettings.copyNotifyEmail,
      copyUseTwoToOneRr: copySettings.copyUseTwoToOneRr,
      copyAutoBreakevenEnabled: copySettings.copyAutoBreakevenEnabled,
      copyEmailAlertsEnabled: copySettings.copyEmailAlertsEnabled,
      copyHealth: {
        ready: copySettings.copyHealthReady,
        message: copySettings.copyHealthMessage,
        checkedAt: copySettings.copyHealthCheckedAt,
      },
      riskPercent: copySettings.copyRiskPercent,
      leaders: leadersWithStats,
      terminal,
      journal,
      stats: {
        openCount,
        closedCount,
        totalRealizedProfit,
        floatingProfit,
      },
    };
  }

  /** Sync open copy trades and credit profit-share commission when positions close. */
  async syncCopyTradeCommissions(): Promise<{ closed: number; credited: number }> {
    const copyAccountId = await this.metaApi.resolveCopyAccountIdAsync();
    if (!this.metaApi.isConfigured || !copyAccountId) {
      return { closed: 0, credited: 0 };
    }

    const { notifyEmail, copyEmailAlertsEnabled } = await this.getCopyConfig();

    const openRows = await this.prisma.copyTrade.findMany({
      where: {
        copyAccountId,
        status: CopyTradeStatus.OPEN,
        commissionCredited: false,
      },
      include: {
        signal: { select: { signalId: true } },
      },
    });
    if (openRows.length === 0) return { closed: 0, credited: 0 };

    const terminal = await this.metaApi.getTerminalState(copyAccountId);
    const openPositionIds = new Set(
      (terminal.positions ?? []).map((p) => p.id),
    );
    const positionProfitById = new Map(
      (terminal.positions ?? []).map((p) => [
        p.id,
        p.profit + p.unrealizedProfit + p.swap + p.commission,
      ]),
    );

    let closed = 0;
    let credited = 0;

    for (const row of openRows) {
      const positionId = row.metaApiPositionId;
      if (positionId && openPositionIds.has(positionId)) {
        const liveProfit = positionProfitById.get(positionId);
        if (liveProfit != null && liveProfit !== Number(row.profit ?? 0)) {
          await this.prisma.copyTrade.update({
            where: { id: row.id },
            data: { profit: liveProfit },
          });
        }
        continue;
      }

      const finalProfit = Number(row.profit ?? 0);
      const now = new Date();
      await this.prisma.copyTrade.update({
        where: { id: row.id },
        data: {
          status: CopyTradeStatus.CLOSED,
          closedAt: now,
          profit: finalProfit,
        },
      });
      closed += 1;

      if (finalProfit > 0 && copyEmailAlertsEnabled) {
        this.notifications.copyTakeProfitHit(notifyEmail, {
          signalId: row.signal.signalId,
          symbol: row.symbol,
          direction: row.direction,
          entryPrice: row.entryPrice != null ? Number(row.entryPrice) : null,
          takeProfit: Number(row.takeProfit),
          profit: finalProfit,
          volume: row.volume != null ? Number(row.volume) : null,
        });
      }

      if (finalProfit > 0) {
        const result = await this.profitShare.creditEarning(
          row.sourceUserId,
          finalProfit,
          `Copy trade commission — ${row.symbol} (${row.signal.signalId})`,
          row.id,
        );
        if (result) {
          await this.prisma.copyTrade.update({
            where: { id: row.id },
            data: { commissionCredited: true },
          });
          credited += 1;
        }
      } else {
        await this.prisma.copyTrade.update({
          where: { id: row.id },
          data: { commissionCredited: true },
        });
      }
    }

    if (closed > 0) {
      this.logger.log(
        `Copy trade sync: ${closed} closed, ${credited} commission credit(s)`,
      );
    }

    return { closed, credited };
  }
}
