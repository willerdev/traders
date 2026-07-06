import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { TP_REWARD_USD } from '../common/constants';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
  ) {}

  async creditTpReward(
    userId: string,
    signalId: string,
    exitPrice: number,
    options?: { reward?: number; rewardLabel?: string; scoringRr?: number },
  ) {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const defaultReward = Number(config?.tpRewardUsd ?? TP_REWARD_USD);
    const reward = options?.reward ?? defaultReward;
    const rewardLabel = options?.rewardLabel ?? 'TP reward';

    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
      include: { trade: true },
    });

    if (!signal || !signal.trade || signal.status !== 'OPEN') {
      return null;
    }

    const account = await this.prisma.virtualAccount.findUnique({
      where: { userId },
    });
    if (!account) return null;

    const newBalance = Number(account.balance) + reward;
    const newWeekly = Number(account.weeklyProfit) + reward;
    const newTotal = Number(account.totalProfit) + reward;

    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signalId },
        data: {
          status: 'WON',
          resolvedAt: new Date(),
          pnl: reward,
          pointsAwarded: 0,
        },
      }),
      this.prisma.trade.update({
        where: { id: signal.trade.id },
        data: {
          isWin: true,
          exitPrice,
          pnl: reward,
          closedAt: new Date(),
          entryPrice:
            signal.trade.entryPrice ??
            (Number(signal.entryMin) + Number(signal.entryMax)) / 2,
        },
      }),
      this.prisma.virtualAccount.update({
        where: { userId },
        data: {
          balance: newBalance,
          weeklyProfit: newWeekly,
          totalProfit: newTotal,
        },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          amount: reward,
          type: 'TP_REWARD',
          referenceId: signal.signalId,
          description: `$${reward} ${rewardLabel} — ${signal.symbol}`,
          balanceAfter: newBalance,
        },
      }),
    ]);

    const scoring = await this.scoring.scoreTrade(
      userId,
      signalId,
      true,
      options?.scoringRr ?? Number(signal.riskRewardRatio),
    );

    await this.prisma.signal.update({
      where: { id: signalId },
      data: { pointsAwarded: scoring.totalPoints },
    });

    this.logger.log(
      `TP hit: ${signal.symbol} — $${reward} credited to ${userId}`,
    );

    return { reward, newBalance, signalId: signal.signalId, scoring };
  }

  /**
   * Credits a TP reward for a setup that is no longer OPEN — e.g. the position
   * was manually closed by an admin or the setup auto-expired before the claim
   * was reviewed. Marks the setup WON and pays the reward, but never twice.
   */
  async creditTpRewardForResolvedSetup(
    userId: string,
    signalId: string,
    exitPrice: number,
    options?: { reward?: number; rewardLabel?: string },
  ) {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const reward =
      options?.reward ?? Number(config?.tpRewardUsd ?? TP_REWARD_USD);
    const rewardLabel = options?.rewardLabel ?? 'TP reward';

    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
      include: { trade: true },
    });
    if (!signal || !signal.trade || signal.status === 'OPEN') return null;

    const priorReward = await this.prisma.walletTransaction.findFirst({
      where: { userId, type: 'TP_REWARD', referenceId: signal.signalId },
      select: { id: true },
    });
    if (priorReward) return null;

    const account = await this.prisma.virtualAccount.findUnique({
      where: { userId },
    });
    if (!account) return null;

    const newBalance = Number(account.balance) + reward;
    const newWeekly = Number(account.weeklyProfit) + reward;
    const newTotal = Number(account.totalProfit) + reward;

    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signalId },
        data: {
          status: 'WON',
          resolvedAt: signal.resolvedAt ?? new Date(),
          pnl: reward,
        },
      }),
      this.prisma.trade.update({
        where: { id: signal.trade.id },
        data: {
          isWin: true,
          exitPrice,
          pnl: reward,
          closedAt: signal.trade.closedAt ?? new Date(),
          entryPrice:
            signal.trade.entryPrice ??
            (Number(signal.entryMin) + Number(signal.entryMax)) / 2,
        },
      }),
      this.prisma.virtualAccount.update({
        where: { userId },
        data: {
          balance: newBalance,
          weeklyProfit: newWeekly,
          totalProfit: newTotal,
        },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          amount: reward,
          type: 'TP_REWARD',
          referenceId: signal.signalId,
          description: `$${reward} ${rewardLabel} (setup closed before review) — ${signal.symbol}`,
          balanceAfter: newBalance,
        },
      }),
    ]);

    this.logger.log(
      `TP reward on resolved setup: ${signal.symbol} — $${reward} credited to ${userId}`,
    );

    return { reward, newBalance, signalId: signal.signalId, scoring: null };
  }

  async resolveAsLoss(userId: string, signalId: string, exitPrice: number) {
    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
      include: { trade: true },
    });

    if (!signal || !signal.trade || signal.status !== 'OPEN') return null;

    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signalId },
        data: { status: 'LOST', resolvedAt: new Date(), pnl: 0 },
      }),
      this.prisma.trade.update({
        where: { id: signal.trade.id },
        data: {
          isWin: false,
          exitPrice,
          pnl: 0,
          closedAt: new Date(),
        },
      }),
    ]);

    const scoring = await this.scoring.scoreTrade(
      userId,
      signalId,
      false,
      Number(signal.riskRewardRatio),
    );

    await this.prisma.signal.update({
      where: { id: signalId },
      data: { pointsAwarded: scoring.totalPoints },
    });

    return { signalId: signal.signalId, scoring };
  }

  /** Manual close before full TP — no USD reward, but counts as a win if TP1 was reached. */
  async resolveAsManualWin(
    userId: string,
    signalId: string,
    exitPrice: number,
    options?: { fullTp?: boolean },
  ) {
    const reward = options?.fullTp
      ? Number(
          (
            await this.prisma.platformConfig.findUnique({
              where: { id: 'default' },
            })
          )?.tpRewardUsd ?? TP_REWARD_USD,
        )
      : 0;

    return this.creditTpReward(userId, signalId, exitPrice, {
      reward,
      rewardLabel: options?.fullTp
        ? 'Manual close at full TP'
        : 'Manual close (TP1+)',
    });
  }

  /** Closed in profit zone but before TP1 — neutral outcome, no win/loss points. */
  async resolveAsEven(userId: string, signalId: string, exitPrice: number) {
    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
      include: { trade: true },
    });

    if (!signal || !signal.trade || signal.status !== 'OPEN') return null;

    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signalId },
        data: { status: 'ARCHIVED', resolvedAt: new Date(), pnl: 0 },
      }),
      this.prisma.trade.update({
        where: { id: signal.trade.id },
        data: {
          isWin: false,
          exitPrice,
          pnl: 0,
          closedAt: new Date(),
        },
      }),
      this.prisma.virtualAccount.update({
        where: { userId },
        data: { totalTrades: { increment: 1 } },
      }),
    ]);

    return { signalId: signal.signalId, outcome: 'even' as const };
  }
}
