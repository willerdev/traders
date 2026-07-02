import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  profitShareTraderAmount,
  profitShareWithdrawThreshold,
  resolveProfitShareConfig,
} from '../common/profit-share.util';

@Injectable()
export class ProfitShareService {
  private readonly logger = new Logger(ProfitShareService.name);

  constructor(private prisma: PrismaService) {}

  private async loadConfig() {
    const platform = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return resolveProfitShareConfig(platform);
  }

  async isActive(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profitShareActive: true },
    });
    return Boolean(user?.profitShareActive);
  }

  async getStatus(userId: string) {
    const [user, account, config] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          profitShareActive: true,
          profitShareEnrolledAt: true,
        },
      }),
      this.prisma.virtualAccount.findUnique({ where: { userId } }),
      this.loadConfig(),
    ]);

    if (!user) throw new NotFoundException('User not found');

    const balance = Number(account?.profitShareBalance ?? 0);
    const earned = Number(account?.profitShareEarned ?? 0);
    const threshold = profitShareWithdrawThreshold(
      config,
      account?.balance != null ? Number(account.balance) : null,
    );
    const remaining = Math.max(0, threshold - balance);

    return {
      active: user.profitShareActive,
      enrolledAt: user.profitShareEnrolledAt?.toISOString() ?? null,
      balance,
      lifetimeEarned: earned,
      sharePercent: config.sharePercent,
      feeUsdt: config.feeUsdt,
      withdrawThreshold: threshold,
      withdrawThresholdPercent: config.withdrawThresholdPercent,
      canWithdraw: user.profitShareActive && balance >= threshold && balance > 0,
      amountToWithdraw: balance,
      remainingToWithdraw: remaining,
      initialInvestmentBasis: Number(account?.balance ?? config.startingBalance),
    };
  }

  async activate(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        profitShareActive: true,
        profitShareEnrolledAt: new Date(),
      },
    });
    this.logger.log(`Profit share activated for ${userId}`);
  }

  async creditEarning(
    userId: string,
    grossAmount: number,
    description: string,
    referenceId?: string,
  ) {
    if (grossAmount <= 0) return null;

    const active = await this.isActive(userId);
    if (!active) return null;

    const config = await this.loadConfig();
    const amount = profitShareTraderAmount(grossAmount, config.sharePercent);
    if (amount <= 0) return null;

    const account = await this.prisma.virtualAccount.findUnique({
      where: { userId },
    });
    if (!account) return null;

    const nextBalance = Number(account.profitShareBalance) + amount;
    const nextEarned = Number(account.profitShareEarned) + amount;

    await this.prisma.$transaction([
      this.prisma.virtualAccount.update({
        where: { userId },
        data: {
          profitShareBalance: nextBalance,
          profitShareEarned: nextEarned,
        },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          amount,
          type: 'PROFIT_SHARE',
          referenceId,
          description,
          balanceAfter: nextBalance,
        },
      }),
    ]);

    this.logger.log(
      `Profit share +$${amount} for ${userId} (${description})`,
    );

    return { amount, balance: nextBalance };
  }

  async deductOnPayout(userId: string, amount: number, payoutId: string) {
    const account = await this.prisma.virtualAccount.findUnique({
      where: { userId },
    });
    if (!account) throw new NotFoundException('Virtual account not found');

    const balance = Number(account.profitShareBalance);
    if (amount > balance) {
      throw new BadRequestException('Insufficient profit share balance');
    }

    const nextBalance = balance - amount;
    await this.prisma.$transaction([
      this.prisma.virtualAccount.update({
        where: { userId },
        data: { profitShareBalance: nextBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          amount: -amount,
          type: 'PAYOUT',
          referenceId: payoutId,
          description: `Profit share withdrawal — $${amount} USDT`,
          balanceAfter: nextBalance,
        },
      }),
    ]);
  }
}
