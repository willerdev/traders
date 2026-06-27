import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignalHubService } from '../signals/signal-hub.service';
import { currentWeekYear } from '../common/week.util';
import { ensureDemoLeaderboardTraders } from './demo-leaderboard.seed';

@Injectable()
export class LeaderboardService implements OnModuleInit {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    private prisma: PrismaService,
    private signalHub: SignalHubService,
  ) {}

  async onModuleInit() {
    const { weekNumber, year } = currentWeekYear();
    try {
      let entries = await this.refreshLeaderboard(weekNumber, year);

      if (entries.length < 3) {
        const ranked = await ensureDemoLeaderboardTraders(this.prisma);
        if (ranked > entries.length) {
          entries = await this.refreshLeaderboard(weekNumber, year);
          this.logger.log(
            `Demo leaderboard traders ensured — ${entries.length} ranked`,
          );
        }
      }

      this.logger.log(
        `Leaderboard initialized: ${entries.length} traders (week ${weekNumber}, ${year})`,
      );
    } catch (err) {
      this.logger.warn(
        `Leaderboard init refresh failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async refreshLeaderboard(weekNumber: number, year: number) {
    const accounts = await this.prisma.virtualAccount.findMany({
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: [{ score: 'desc' }, { winRate: 'desc' }],
    });

    const entries = accounts.map((account, index) => ({
      userId: account.userId,
      displayName: account.user.displayName,
      tier: account.tier,
      rank: index + 1,
      score: account.score,
      profit: account.totalProfit,
      winRate: account.winRate,
      drawdown: account.maxDrawdown,
      consistency: account.winRate,
      weekNumber,
      year,
    }));

    await this.prisma.leaderboard.deleteMany({ where: { weekNumber, year } });

    if (entries.length > 0) {
      await this.prisma.leaderboard.createMany({ data: entries });
    }

    return entries;
  }

  async getLeaderboard(weekNumber: number, year: number, limit = 50) {
    let rows = await this.prisma.leaderboard.findMany({
      where: { weekNumber, year },
      orderBy: { rank: 'asc' },
      take: limit,
    });

    if (rows.length === 0) {
      await this.refreshLeaderboard(weekNumber, year);
      rows = await this.prisma.leaderboard.findMany({
        where: { weekNumber, year },
        orderBy: { rank: 'asc' },
        take: limit,
      });
    }

    if (rows.length < 3) {
      await ensureDemoLeaderboardTraders(this.prisma);
      await this.refreshLeaderboard(weekNumber, year);
      rows = await this.prisma.leaderboard.findMany({
        where: { weekNumber, year },
        orderBy: { rank: 'asc' },
        take: limit,
      });
    }

    if (rows.length === 0) {
      const latest = await this.prisma.leaderboard.findFirst({
        orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
        select: { weekNumber: true, year: true },
      });
      if (
        latest &&
        (latest.weekNumber !== weekNumber || latest.year !== year)
      ) {
        rows = await this.prisma.leaderboard.findMany({
          where: {
            weekNumber: latest.weekNumber,
            year: latest.year,
          },
          orderBy: { rank: 'asc' },
          take: limit,
        });
      }
    }

    return rows;
  }

  async getUserRank(userId: string, weekNumber: number, year: number) {
    return this.prisma.leaderboard.findUnique({
      where: { userId_year_weekNumber: { userId, year, weekNumber } },
    });
  }

  async getHubExecutionStats(filters?: {
    days?: number;
    min_closed_trades?: number;
    limit?: number;
  }) {
    const empty = {
      days: filters?.days ?? 90,
      total_senders: 0,
      returned: 0,
      senders: [],
    };

    if (!this.signalHub.isConfigured) {
      return empty;
    }

    const profitability = await this.signalHub.getSenderProfitability(filters);
    if (profitability?.senders?.length) {
      return profitability;
    }

    const report = await this.signalHub.getSenderReport({
      days: filters?.days,
      limit: filters?.limit,
      min_closed_trades: filters?.min_closed_trades ?? 0,
      sort: 'profit',
    });

    if (report?.senders?.length) {
      return report;
    }

    return profitability ?? report ?? empty;
  }
}
