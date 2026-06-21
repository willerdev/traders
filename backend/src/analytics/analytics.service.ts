import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getAdminDashboard() {
    const [
      activeTraders,
      totalUsers,
      todayRegistrations,
      totalRevenue,
      pendingPayouts,
      topTraders,
      recentViolations,
    ] = await Promise.all([
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'CONFIRMED' },
        _sum: { amount: true },
      }),
      this.prisma.payout.aggregate({
        where: { status: 'PENDING' },
        _sum: { traderShare: true },
        _count: true,
      }),
      this.prisma.virtualAccount.findMany({
        orderBy: { score: 'desc' },
        take: 10,
        include: { user: { select: { displayName: true } } },
      }),
      this.prisma.violation.findMany({
        where: { resolved: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { displayName: true } } },
      }),
    ]);

    const weeklyGrowth = await this.getWeeklyGrowth();

    return {
      activeTraders,
      totalUsers,
      todayRegistrations,
      totalRevenue: totalRevenue._sum.amount ?? 0,
      pendingPayouts: {
        count: pendingPayouts._count,
        amount: pendingPayouts._sum.traderShare ?? 0,
      },
      topTraders: topTraders.map((t) => ({
        displayName: t.user.displayName,
        score: t.score,
        tier: t.tier,
        profit: t.totalProfit,
        winRate: t.winRate,
      })),
      recentViolations,
      weeklyGrowth,
    };
  }

  private async getWeeklyGrowth() {
    const weeks: { week: string; registrations: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i * 7);
      const start = new Date(date);
      start.setDate(start.getDate() - 7);

      const count = await this.prisma.user.count({
        where: { createdAt: { gte: start, lte: date } },
      });

      weeks.push({ week: `W${4 - i}`, registrations: count });
    }
    return weeks;
  }
}
