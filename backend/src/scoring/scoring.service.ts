import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RankTier } from '@prisma/client';
import {
  LOSS_POINTS,
  RR_BONUS,
  STREAK_THRESHOLDS,
  TIER_BALANCES,
  WIN_POINTS,
} from '../common/constants';
import { currentWeekYear } from '../common/week.util';

@Injectable()
export class ScoringService {
  constructor(private prisma: PrismaService) {}

  calculateRrBonus(riskRewardRatio: number): number {
    const rounded = Math.floor(riskRewardRatio);
    return RR_BONUS[String(rounded)] ?? 0;
  }

  async scoreTrade(
    userId: string,
    signalId: string,
    isWin: boolean,
    riskRewardRatio: number,
  ) {
    const basePoints = isWin ? WIN_POINTS : LOSS_POINTS;
    const rrBonus = isWin ? this.calculateRrBonus(riskRewardRatio) : 0;

    const { weekNumber, year } = currentWeekYear();

    const consistencyBonus = isWin
      ? await this.calculateConsistencyBonus(userId, weekNumber, year)
      : 0;

    const totalPoints = basePoints + rrBonus + consistencyBonus;

    await this.prisma.tradeScore.create({
      data: {
        userId,
        signalId,
        basePoints,
        rrBonus,
        consistencyBonus,
        totalPoints,
        weekNumber,
        year,
      },
    });

    const account = await this.prisma.virtualAccount.findUnique({
      where: { userId },
    });

    if (!account) return { totalPoints };

    const newScore = account.score + totalPoints;
    const consecutiveWins = isWin ? account.consecutiveWins + 1 : 0;
    const consecutiveLosses = isWin ? 0 : account.consecutiveLosses + 1;
    const winningTrades = isWin
      ? account.winningTrades + 1
      : account.winningTrades;
    const losingTrades = isWin
      ? account.losingTrades
      : account.losingTrades + 1;
    const totalTrades = account.totalTrades + 1;
    const winRate =
      totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    let adjustedScore = newScore;
    let streakWarningIssued = account.streakWarningIssued;

    if (consecutiveLosses >= STREAK_THRESHOLDS.SCORE_REDUCTION) {
      adjustedScore = Math.floor(newScore * 0.9);
    }

    if (consecutiveLosses >= STREAK_THRESHOLDS.ACCOUNT_RESET) {
      await this.resetAccount(userId);
      return { totalPoints, accountReset: true };
    }

    await this.prisma.virtualAccount.update({
      where: { userId },
      data: {
        score: adjustedScore,
        consecutiveWins,
        consecutiveLosses,
        winningTrades,
        losingTrades,
        totalTrades,
        winRate,
        streakWarningIssued:
          consecutiveLosses >= STREAK_THRESHOLDS.WARNING
            ? true
            : streakWarningIssued,
      },
    });

    await this.checkTierUpgrade(userId, adjustedScore);

    return {
      totalPoints,
      warning:
        consecutiveLosses >= STREAK_THRESHOLDS.WARNING &&
        consecutiveLosses < STREAK_THRESHOLDS.SCORE_REDUCTION,
    };
  }

  private async calculateConsistencyBonus(
    userId: string,
    weekNumber: number,
    year: number,
  ): Promise<number> {
    const weeklyScores = await this.prisma.tradeScore.findMany({
      where: { userId, weekNumber, year },
    });

    const profitableDays = new Set(
      weeklyScores
        .filter((s) => s.totalPoints > 0)
        .map((s) => s.createdAt.toDateString()),
    ).size;

    if (profitableDays >= 5) return 15;
    if (profitableDays >= 3) return 5;
    return 0;
  }

  private async checkTierUpgrade(userId: string, score: number) {
    let tier: RankTier = 'BRONZE';
    if (score >= 500) tier = 'ELITE';
    else if (score >= 300) tier = 'DIAMOND';
    else if (score >= 200) tier = 'GOLD';
    else if (score >= 100) tier = 'SILVER';

    const account = await this.prisma.virtualAccount.findUnique({
      where: { userId },
    });

    if (!account || account.tier === tier) return;

    const tierOrder: RankTier[] = [
      'BRONZE',
      'SILVER',
      'GOLD',
      'DIAMOND',
      'ELITE',
    ];
    const currentIdx = tierOrder.indexOf(account.tier);
    const newIdx = tierOrder.indexOf(tier);

    if (newIdx > currentIdx) {
      await this.prisma.virtualAccount.update({
        where: { userId },
        data: {
          tier,
          balance: TIER_BALANCES[tier],
        },
      });
    }
  }

  private async resetAccount(userId: string) {
    await this.prisma.virtualAccount.update({
      where: { userId },
      data: {
        balance: TIER_BALANCES.BRONZE,
        tier: 'BRONZE',
        score: 0,
        consecutiveLosses: 0,
        consecutiveWins: 0,
        streakWarningIssued: false,
        weeklyProfit: 0,
        currentDrawdown: 0,
      },
    });
  }
}
