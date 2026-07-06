import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CopyTradeStatus, TradeDirection } from '@prisma/client';
import { RISK_PERCENT } from '../common/constants';
import { currentWeekYear } from '../common/week.util';
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
      select: { copyRiskPercent: true, copyNotifyEmail: true },
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
    };
  }

  async getCopySettings() {
    const { riskPercent, notifyEmail } = await this.getCopyConfig();
    return {
      copyRiskPercent: riskPercent,
      copyNotifyEmail: notifyEmail,
    };
  }

  async updateCopySettings(input: {
    copyRiskPercent?: number;
    copyNotifyEmail?: string;
  }) {
    const data: {
      copyRiskPercent?: number;
      copyNotifyEmail?: string;
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
      leaders: await this.getActiveCopyTargets(),
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
      leaders: await this.getActiveCopyTargets(),
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

    const { riskPercent, notifyEmail } = await this.getCopyConfig();

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
    const tp = input.takeProfit;
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
          entryPrice: openPrice,
          status: CopyTradeStatus.PENDING,
          notes: `Mirroring #${source.rank} ${source.displayName} (max ${riskPercent}% risk)`,
        },
      });
    } else {
      await this.prisma.copyTrade.update({
        where: { id: journal.id },
        data: {
          status: CopyTradeStatus.PENDING,
          notes: `Retry mirroring #${source.rank} ${source.displayName} (max ${riskPercent}% risk)`,
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
          takeProfit: tp,
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
          takeProfit: tp,
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

  async getCopyDashboard() {
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
        riskPercent: copySettings.copyRiskPercent,
        leaders,
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

    const terminal = await this.metaApi.getTerminalState(copyAccountId);
    const journalRows = await this.prisma.copyTrade.findMany({
      where: { copyAccountId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        sourceUser: { select: { displayName: true } },
        signal: { select: { signalId: true, status: true } },
      },
    });

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
      riskPercent: copySettings.copyRiskPercent,
      leaders,
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
