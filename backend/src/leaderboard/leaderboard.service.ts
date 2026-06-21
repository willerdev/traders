import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.leaderboard.findMany({
      where: { weekNumber, year },
      orderBy: { rank: 'asc' },
      take: limit,
    });
  }

  async getUserRank(userId: string, weekNumber: number, year: number) {
    return this.prisma.leaderboard.findUnique({
      where: { userId_year_weekNumber: { userId, year, weekNumber } },
    });
  }
}
