import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationService } from '../email/notification.service';
import { isKampalaWeekend } from '../common/kampala-weekend.util';
import {
  UNITRUST_DAILY_YIELD_PERCENT_DEFAULT,
  UNITRUST_MAX_DEPOSIT,
  UNITRUST_MIN_DEPOSIT_DEFAULT,
  UNITRUST_YIELD_MIN_DEPOSIT_AGE_MS,
} from './unitrust.constants';
import {
  hasApprovedLoan,
  LOAN_REINVEST_BLOCKED_MESSAGE,
} from '../loans/active-loan.util';

@Injectable()
export class UnitrustService {
  private readonly logger = new Logger(UnitrustService.name);

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
    private notifications: NotificationService,
  ) {}

  private async minDeposit(): Promise<number> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const n = Number(config?.unitrustMinDepositUsdt ?? UNITRUST_MIN_DEPOSIT_DEFAULT);
    return Number.isFinite(n) && n > 0 ? n : UNITRUST_MIN_DEPOSIT_DEFAULT;
  }

  private async dailyYieldPercent(): Promise<number> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const n = Number(
      config?.unitrustDailyYieldPercent ?? UNITRUST_DAILY_YIELD_PERCENT_DEFAULT,
    );
    return Number.isFinite(n) && n > 0 ? n : UNITRUST_DAILY_YIELD_PERCENT_DEFAULT;
  }

  private async isYieldPaused(): Promise<boolean> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return Boolean(config?.unitrustYieldPaused);
  }

  /** Calendar date in Africa/Kampala. */
  private kampalaToday() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kampala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(new Date());
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    const m = Number(parts.find((p) => p.type === 'month')?.value);
    const d = Number(parts.find((p) => p.type === 'day')?.value);
    return new Date(Date.UTC(y, m - 1, d));
  }

  /** Kampala year-month key, e.g. "2026-07". */
  private kampalaYearMonth(date = new Date()): string {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kampala',
      year: 'numeric',
      month: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    return `${y}-${m}`;
  }

  private startOfKampalaMonth(date = new Date()): Date {
    const key = this.kampalaYearMonth(date);
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  }

  private nextKampalaMonthStart(date = new Date()): Date {
    const start = this.startOfKampalaMonth(date);
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { platformWallet: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const yieldPercent = await this.dailyYieldPercent();
    const minDeposit = await this.minDeposit();
    const unitrustBalance = Number(user.platformWallet?.unitrustBalance ?? 0);
    const availableBalance = Number(user.platformWallet?.availableBalance ?? 0);
    const projectedDaily =
      Math.round(((unitrustBalance * yieldPercent) / 100) * 100) / 100;

    const monthStart = this.startOfKampalaMonth();
    const redeemThisMonth = await this.prisma.walletTransaction.findFirst({
      where: {
        userId,
        type: 'UNITRUST_REDEEM',
        createdAt: { gte: monthStart },
      },
      orderBy: { createdAt: 'desc' },
    });

    const recentCredits = await this.prisma.unitrustDailyCredit.findMany({
      where: { userId },
      orderBy: { creditDate: 'desc' },
      take: 14,
    });

    return {
      active: user.unitrustActive,
      enrolledAt: user.unitrustEnrolledAt?.toISOString() ?? null,
      unitrustBalance,
      availableBalance,
      dailyYieldPercent: yieldPercent,
      minDepositUsdt: minDeposit,
      maxDepositUsdt: UNITRUST_MAX_DEPOSIT,
      projectedDailyEarning: projectedDaily,
      yieldPaused: await this.isYieldPaused(),
      canWithdrawThisMonth: !redeemThisMonth,
      lastWithdrawAt: redeemThisMonth?.createdAt?.toISOString() ?? null,
      nextWithdrawAt: redeemThisMonth
        ? this.nextKampalaMonthStart().toISOString()
        : null,
      withdrawWindowLabel: 'Once per calendar month (Africa/Kampala)',
      creditTimeLabel: 'Daily at 16:00 Africa/Kampala',
      recentCredits: recentCredits.map((c) => ({
        amount: Number(c.amount),
        yieldPercent: Number(c.yieldPercent),
        baseBalance: Number(c.baseBalance),
        creditDate: c.creditDate.toISOString().slice(0, 10),
        creditedAt: c.creditedAt.toISOString(),
      })),
    };
  }

  /**
   * Enroll (if needed) and move USDT from wallet → unitrust.
   * No enrollment fee — full amount goes into the unitrust corpus.
   */
  async enrollFromWallet(userId: string, amountRaw: number) {
    if (await hasApprovedLoan(this.prisma, userId)) {
      throw new BadRequestException(LOAN_REINVEST_BLOCKED_MESSAGE);
    }

    const minDeposit = await this.minDeposit();
    const amount = Math.round(Number(amountRaw) * 100) / 100;
    if (!Number.isFinite(amount) || amount < minDeposit) {
      throw new BadRequestException(
        `Unitrust minimum is $${minDeposit.toFixed(2)} USDT`,
      );
    }
    if (amount > UNITRUST_MAX_DEPOSIT) {
      throw new BadRequestException(
        `Unitrust maximum is $${UNITRUST_MAX_DEPOSIT.toFixed(2)} USDT`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const wallet = await this.walletService.getOrCreateWallet(userId);
    const available = Number(wallet.availableBalance);
    if (available < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance — need $${amount.toFixed(2)} but have $${available.toFixed(2)}`,
      );
    }

    const nextAvailable = available - amount;
    const nextUnitrust = Number(wallet.unitrustBalance ?? 0) + amount;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          unitrustActive: true,
          unitrustEnrolledAt: user.unitrustEnrolledAt ?? now,
        },
      }),
      this.prisma.platformWallet.update({
        where: { userId },
        data: {
          availableBalance: nextAvailable,
          unitrustBalance: nextUnitrust,
        },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          amount: -amount,
          type: 'UNITRUST_ALLOCATE',
          description: `Unitrust deposit — $${amount.toFixed(2)} USDT (earns after 24h)`,
          balanceAfter: nextAvailable,
        },
      }),
    ]);

    this.notifications.adminSystemAlert('Unitrust deposit', [
      `User ${user.displayName} (${user.email ?? userId})`,
      `Allocated $${amount.toFixed(2)} USDT to Unitrust.`,
    ]);

    return {
      success: true,
      amount,
      walletBalance: nextAvailable,
      unitrustBalance: nextUnitrust,
      message: `$${amount.toFixed(2)} USDT moved into Unitrust. Yield starts after 24 hours.`,
    };
  }

  async allocate(userId: string, amountRaw: number) {
    return this.enrollFromWallet(userId, amountRaw);
  }

  /**
   * Redeem unitrust → wallet. Allowed once per Kampala calendar month.
   */
  async redeem(userId: string, amountRaw: number) {
    const amount = Math.round(Number(amountRaw) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.unitrustActive) {
      throw new BadRequestException('Enroll in Unitrust before withdrawing');
    }

    const monthStart = this.startOfKampalaMonth();
    const existingRedeem = await this.prisma.walletTransaction.findFirst({
      where: {
        userId,
        type: 'UNITRUST_REDEEM',
        createdAt: { gte: monthStart },
      },
    });
    if (existingRedeem) {
      const next = this.nextKampalaMonthStart();
      throw new BadRequestException(
        `Unitrust allows one withdrawal per month. Next window opens ${next.toISOString().slice(0, 10)} (Africa/Kampala).`,
      );
    }

    const wallet = await this.walletService.getOrCreateWallet(userId);
    const unitrust = Number(wallet.unitrustBalance ?? 0);
    const available = Number(wallet.availableBalance);
    if (unitrust < amount) {
      throw new BadRequestException(
        `Insufficient Unitrust balance — need $${amount.toFixed(2)} but have $${unitrust.toFixed(2)}`,
      );
    }

    const nextAvailable = available + amount;
    const nextUnitrust = unitrust - amount;

    await this.prisma.$transaction([
      this.prisma.platformWallet.update({
        where: { userId },
        data: {
          availableBalance: nextAvailable,
          unitrustBalance: nextUnitrust,
        },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          amount,
          type: 'UNITRUST_REDEEM',
          description: `Unitrust monthly withdrawal — $${amount.toFixed(2)} USDT to wallet`,
          balanceAfter: nextAvailable,
        },
      }),
      ...(nextUnitrust <= 0
        ? [
            this.prisma.user.update({
              where: { id: userId },
              data: { unitrustActive: false },
            }),
          ]
        : []),
    ]);

    return {
      success: true,
      amount,
      walletBalance: nextAvailable,
      unitrustBalance: nextUnitrust,
      nextWithdrawAt: this.nextKampalaMonthStart().toISOString(),
      message: `$${amount.toFixed(2)} USDT moved to wallet. Next Unitrust withdrawal next calendar month.`,
    };
  }

  async creditDailyEarnings() {
    if (await this.isYieldPaused()) {
      this.logger.warn('Unitrust daily yield skipped — paused globally');
      return { credited: 0, skipped: 'global_pause' as const };
    }

    const today = this.kampalaToday();
    if (isKampalaWeekend()) {
      this.logger.log('Unitrust daily yield skipped — weekend (Kampala)');
      return { credited: 0, holdSkipped: 0, skipped: 'weekend' as const };
    }
    const yieldPercent = await this.dailyYieldPercent();
    const holdSince = new Date(Date.now() - UNITRUST_YIELD_MIN_DEPOSIT_AGE_MS);

    const members = await this.prisma.user.findMany({
      where: { unitrustActive: true },
      include: { platformWallet: true },
    });

    let credited = 0;
    let holdSkipped = 0;

    for (const user of members) {
      const existing = await this.prisma.unitrustDailyCredit.findUnique({
        where: {
          userId_creditDate: { userId: user.id, creditDate: today },
        },
      });
      if (existing) continue;

      const baseBalance = Number(user.platformWallet?.unitrustBalance ?? 0);
      if (baseBalance <= 0 || yieldPercent <= 0) continue;

      // Whitelist investors skip the 24h new-capital hold.
      let recentAllocated = 0;
      if (!user.instantWithdraw) {
        const recentAllocate = await this.prisma.walletTransaction.aggregate({
          where: {
            userId: user.id,
            type: 'UNITRUST_ALLOCATE',
            createdAt: { gte: holdSince },
          },
          _sum: { amount: true },
        });
        recentAllocated = Math.abs(Number(recentAllocate._sum.amount ?? 0));
      }
      const eligibleBalance =
        Math.round(Math.max(0, baseBalance - recentAllocated) * 100) / 100;
      if (eligibleBalance <= 0) {
        holdSkipped++;
        continue;
      }

      const earning =
        Math.round(((eligibleBalance * yieldPercent) / 100) * 100) / 100;
      if (earning <= 0) continue;

      const available = Number(user.platformWallet?.availableBalance ?? 0);
      const nextAvailable = available + earning;

      try {
        await this.prisma.$transaction([
          this.prisma.unitrustDailyCredit.create({
            data: {
              userId: user.id,
              amount: earning,
              yieldPercent,
              baseBalance: eligibleBalance,
              creditDate: today,
            },
          }),
          this.prisma.platformWallet.update({
            where: { userId: user.id },
            data: { availableBalance: nextAvailable },
          }),
          this.prisma.walletTransaction.create({
            data: {
              userId: user.id,
              amount: earning,
              type: 'UNITRUST_EARNING',
              description:
                recentAllocated > 0
                  ? `Unitrust daily earning ${yieldPercent}% on $${eligibleBalance.toFixed(2)} (eligible of $${baseBalance.toFixed(2)}; $${recentAllocated.toFixed(2)} under 24h hold) — $${earning.toFixed(2)} USDT`
                  : `Unitrust daily earning ${yieldPercent}% on $${eligibleBalance.toFixed(2)} — $${earning.toFixed(2)} USDT`,
              balanceAfter: nextAvailable,
            },
          }),
        ]);
        credited++;
      } catch (err) {
        this.logger.warn(
          `Unitrust credit failed for ${user.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.logger.log(
      `Unitrust daily earnings: credited=${credited} holdSkipped=${holdSkipped}`,
    );
    return { credited, holdSkipped };
  }

  async listMembers(limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const users = await this.prisma.user.findMany({
      where: { unitrustActive: true },
      take,
      orderBy: { unitrustEnrolledAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        unitrustEnrolledAt: true,
        platformWallet: {
          select: { unitrustBalance: true, availableBalance: true },
        },
      },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      enrolledAt: u.unitrustEnrolledAt?.toISOString() ?? null,
      unitrustBalance: Number(u.platformWallet?.unitrustBalance ?? 0),
      availableBalance: Number(u.platformWallet?.availableBalance ?? 0),
    }));
  }
}
