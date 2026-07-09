import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignalHubService } from '../signals/signal-hub.service';
import { currentWeekYear } from '../common/week.util';
import { ensureDemoLeaderboardTraders } from './demo-leaderboard.seed';
import { NotificationService } from '../email/notification.service';
import { PlatformNotificationsService } from '../platform-notifications/platform-notifications.service';
import { isDemoLeaderboardUser } from '../common/demo-user.util';

@Injectable()
export class LeaderboardService implements OnModuleInit {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    private prisma: PrismaService,
    private signalHub: SignalHubService,
    private notifications: NotificationService,
    private platformNotifications: PlatformNotificationsService,
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
    const previousRows = await this.prisma.leaderboard.findMany({
      where: { weekNumber, year },
      select: { userId: true, rank: true },
    });
    const previousRankByUser = new Map(
      previousRows.map((row) => [row.userId, row.rank]),
    );

    const accounts = await this.prisma.virtualAccount.findMany({
      where: { user: { status: { not: 'BANNED' } } },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
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
      try {
        await this.prisma.leaderboard.createMany({ data: entries });
      } catch (err) {
        this.logger.warn(
          `Leaderboard refresh skipped (week ${weekNumber}/${year}): ${err instanceof Error ? err.message : err}`,
        );
        return entries;
      }
    }

    if (previousRankByUser.size > 0) {
      await this.notifyRankChanges(entries, previousRankByUser, weekNumber, year);
    }

    return entries;
  }

  private async notifyRankChanges(
    entries: Array<{ userId: string; rank: number; displayName: string }>,
    previousRankByUser: Map<string, number>,
    weekNumber: number,
    year: number,
  ) {
    for (const entry of entries) {
      const oldRank = previousRankByUser.get(entry.userId);
      if (oldRank == null || oldRank === entry.rank) continue;

      const account = await this.prisma.virtualAccount.findUnique({
        where: { userId: entry.userId },
        select: {
          leaderboardLastEmailedRank: true,
          user: { select: { email: true } },
        },
      });
      if (!account || isDemoLeaderboardUser(account.user.email)) continue;
      if (account.leaderboardLastEmailedRank === entry.rank) continue;

      const payload = {
        oldRank,
        newRank: entry.rank,
        weekNumber,
        year,
      };

      if (entry.rank < oldRank) {
        this.notifications.rankImproved(entry.userId, payload);
        await this.platformNotifications.create({
          userId: entry.userId,
          type: 'RANK_IMPROVED',
          title: `You moved up to #${entry.rank}`,
          body: `Congratulations — you climbed from #${oldRank} to #${entry.rank} on this week's leaderboard.`,
          linkUrl: '/leaderboard',
        });
      } else {
        this.notifications.rankDropped(entry.userId, payload);
        await this.platformNotifications.create({
          userId: entry.userId,
          type: 'RANK_DROPPED',
          title: `Leaderboard update — now #${entry.rank}`,
          body: `Your rank shifted from #${oldRank} to #${entry.rank}. Stay disciplined — you can climb back.`,
          linkUrl: '/dashboard',
        });
      }

      await this.prisma.virtualAccount.update({
        where: { userId: entry.userId },
        data: {
          leaderboardLastEmailedRank: entry.rank,
          leaderboardLastEmailedAt: new Date(),
        },
      });

      this.logger.debug(
        `Rank change notified ${entry.displayName}: #${oldRank} → #${entry.rank}`,
      );
    }
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
