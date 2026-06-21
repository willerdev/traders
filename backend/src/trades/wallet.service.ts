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
  ) {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const reward = Number(config?.tpRewardUsd ?? TP_REWARD_USD);

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
          description: `$${reward} TP reward — ${signal.symbol}`,
          balanceAfter: newBalance,
        },
      }),
    ]);

    const scoring = await this.scoring.scoreTrade(
      userId,
      signalId,
      true,
      Number(signal.riskRewardRatio),
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
}
