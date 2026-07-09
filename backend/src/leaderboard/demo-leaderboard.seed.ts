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

export const DEMO_LEADERBOARD_TRADERS: DemoTrader[] = [
  {
    email: 'leaderboard.demo2@traderrank.pro',
    displayName: 'PipMaster_Ke',
    score: 121,
    tier: 'SILVER',
    totalProfit: 86.25,
    winRate: 65,
    maxDrawdown: 6.1,
    totalTrades: 14,
    winningTrades: 9,
    losingTrades: 5,
  },
  {
    email: 'leaderboard.demo3@traderrank.pro',
    displayName: 'XAU_Sniper',
    score: 98,
    tier: 'SILVER',
    totalProfit: 52.0,
    winRate: 58,
    maxDrawdown: 8.5,
    totalTrades: 12,
    winningTrades: 7,
    losingTrades: 5,
  },
  {
    email: 'leaderboard.demo4@traderrank.pro',
    displayName: 'VolatilityQueen',
    score: 76,
    tier: 'BRONZE',
    totalProfit: 31.75,
    winRate: 54,
    maxDrawdown: 9.8,
    totalTrades: 11,
    winningTrades: 6,
    losingTrades: 5,
  },
  {
    email: 'leaderboard.demo5@traderrank.pro',
    displayName: 'TrendLineTom',
    score: 55,
    tier: 'BRONZE',
    totalProfit: 18.5,
    winRate: 50,
    maxDrawdown: 11.2,
    totalTrades: 10,
    winningTrades: 5,
    losingTrades: 5,
  },
];

export async function ensureDemoLeaderboardTraders(
  prisma: PrismaClient,
): Promise<number> {
  if (process.env.SEED_DEMO_LEADERBOARD === 'false') {
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
