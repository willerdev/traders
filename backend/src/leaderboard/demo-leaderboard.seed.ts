import { PrismaClient, RankTier } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { currentWeekYear } from '../common/week.util';

type DemoTrader = {
  email: string;
  displayName: string;
  score: number;
  tier: RankTier;
  totalProfit: number;
  winRate: number;
  maxDrawdown: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
};

export const DEMO_LEADERBOARD_TRADERS: DemoTrader[] = [];

export async function ensureDemoLeaderboardTraders(
  prisma: PrismaClient,
): Promise<number> {
  if (process.env.SEED_DEMO_LEADERBOARD !== 'true') {
    return 0;
  }

  const passwordHash = await bcrypt.hash('DemoLeader123!', 12);

  for (const demo of DEMO_LEADERBOARD_TRADERS) {
    const existing = await prisma.user.findUnique({
      where: { email: demo.email },
    });

    if (existing?.status === 'BANNED') {
      continue;
    }

    if (!existing) {
      await prisma.user.create({
        data: {
          email: demo.email,
          passwordHash,
          displayName: demo.displayName,
          role: 'TRADER',
          status: 'ACTIVE',
          emailVerified: true,
          registrationPaid: true,
          termsAcceptedAt: new Date(),
          virtualAccount: {
            create: {
              balance: 1000 + demo.totalProfit,
              tier: demo.tier,
              score: demo.score,
              totalProfit: demo.totalProfit,
              weeklyProfit: demo.totalProfit,
              winRate: demo.winRate,
              maxDrawdown: demo.maxDrawdown,
              totalTrades: demo.totalTrades,
              winningTrades: demo.winningTrades,
              losingTrades: demo.losingTrades,
              riskPercent: 5,
              maxRiskPerTrade: 50,
            },
          },
        },
      });
    } else {
      await prisma.virtualAccount.update({
        where: { userId: existing.id },
        data: {
          tier: demo.tier,
          score: demo.score,
          totalProfit: demo.totalProfit,
          weeklyProfit: demo.totalProfit,
          winRate: demo.winRate,
          maxDrawdown: demo.maxDrawdown,
          totalTrades: demo.totalTrades,
          winningTrades: demo.winningTrades,
          losingTrades: demo.losingTrades,
        },
      });
    }
  }

  const { weekNumber, year } = currentWeekYear();
  const accounts = await prisma.virtualAccount.findMany({
    where: { user: { status: { not: 'BANNED' } } },
    include: { user: { select: { displayName: true } } },
    orderBy: [{ score: 'desc' }, { winRate: 'desc' }],
  });

  await prisma.leaderboard.deleteMany({ where: { weekNumber, year } });

  if (accounts.length > 0) {
    await prisma.leaderboard.createMany({
      data: accounts.map((account, index) => ({
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
      })),
    });
  }

  return accounts.length;
}
