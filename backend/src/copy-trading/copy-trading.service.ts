import { Injectable, Logger } from '@nestjs/common';
import { CopyTradeStatus, TradeDirection } from '@prisma/client';
import { TradeRiskService } from '../ai/trade-risk.service';
import { RISK_PERCENT } from '../common/constants';
import { currentWeekYear } from '../common/week.util';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import {
  buildCopyTradeIdentifiers,
  MetaApiPendingAction,
  resolvePendingOrderType,
  roundToSymbolDigits,
} from '../metaapi/metaapi-order.util';
import { MetaApiService } from '../metaapi/metaapi.service';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class CopyTradingService {
  private readonly logger = new Logger(CopyTradingService.name);

  constructor(
    private prisma: PrismaService,
    private metaApi: MetaApiService,
    private tradeRisk: TradeRiskService,
    private leaderboard: LeaderboardService,
  ) {}

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

  private async resolveSourceRank(
    userId: string,
  ): Promise<{ rank: number; displayName: string } | null> {
    const leaders = await this.getTopLeaders(3);
    const match = leaders.find((l) => l.userId === userId);
    if (!match) return null;
    return { rank: match.rank, displayName: match.displayName };
  }

  async maybeMirrorTrade(input: CopyMirrorInput): Promise<void> {
    const copyAccountId = this.metaApi.resolveCopyAccountId();
    if (!this.metaApi.isConfigured || !copyAccountId) return;

    const existing = await this.prisma.copyTrade.findUnique({
      where: { signalId: input.signalDbId },
    });
    if (existing && existing.status !== CopyTradeStatus.FAILED) return;

    const source = await this.resolveSourceRank(input.sourceUserId);
    if (!source) {
      this.logger.debug(
        `Copy skip ${input.signalPublicId}: trader not in top 3 this week`,
      );
      return;
    }

    const sl = input.stopLoss;
    const tp = input.takeProfit;
    const openPrice = input.openPrice;

    let journal = existing;
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
          notes: `Mirroring #${source.rank} ${source.displayName}`,
        },
      });
    }

    try {
      const account = await this.metaApi.getAccount(copyAccountId);
      const price = await this.metaApi.getSymbolPrice(account, input.symbol);
      const spec = await this.metaApi.getSymbolSpecification(
        account,
        input.symbol,
      );
      const digits = spec.digits ?? 5;
      const marketPrice =
        input.direction === 'BUY' ? price.ask : price.bid;

      const sizing = await this.tradeRisk.calculatePositionSize({
        account,
        symbol: input.symbol,
        direction: input.direction,
        stopLoss: sl,
        takeProfit: tp,
        riskPercent: RISK_PERCENT,
        maxRiskAmount: undefined,
        entryPrice: openPrice,
      });

      const { comment, clientId } = buildCopyTradeIdentifiers({
        sourceDisplayName: input.sourceDisplayName,
        sourceUserId: input.sourceUserId,
        signalId: input.signalPublicId,
        symbol: input.symbol,
      });

      let tradeResult;
      if (input.pending) {
        const orderKind = (input.orderKind ??
          resolvePendingOrderType(
            input.direction,
            openPrice,
            marketPrice,
          )) as MetaApiPendingAction;
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
            const next = await this.tradeRisk.calculatePositionSize({
              account,
              symbol: input.symbol,
              direction: input.direction,
              stopLoss: sl,
              takeProfit: tp,
              riskPercent: RISK_PERCENT,
              entryPrice: pendingOpen,
            });
            return next.volume;
          },
        });
        tradeResult = placed.trade;
      }

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
          notes: `Copied #${source.rank} ${source.displayName} @ ${RISK_PERCENT}% risk (${sizing.volume} lots)`,
        },
      });

      this.logger.log(
        `Copy trade placed for ${input.signalPublicId} from rank #${source.rank}`,
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
    const copyAccountId = this.metaApi.resolveCopyAccountId();
    const leaders = await this.getTopLeaders(3);

    if (!this.metaApi.isConfigured || !copyAccountId) {
      return {
        configured: false,
        copyAccountId: null,
        message:
          'Copy account not configured — set METAAPI_COPY_ACCOUNT_ID on the server',
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
      riskPercent: RISK_PERCENT,
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
}
