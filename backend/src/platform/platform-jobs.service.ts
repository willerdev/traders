import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { PayoutService } from '../payouts/payout.service';
import { PrismaService } from '../prisma/prisma.service';
import { CopyTradingService } from '../copy-trading/copy-trading.service';
import { Mt5SyncService } from '../mt5-sync/mt5-sync.service';
import { currentWeekYear, getWeekNumber } from '../common/week.util';
import { WEEKLY_ACCESS_MS } from '../common/weekly-access.util';

@Injectable()
export class PlatformJobsService implements OnModuleInit {
  private readonly logger = new Logger(PlatformJobsService.name);

  constructor(
    private leaderboard: LeaderboardService,
    private payouts: PayoutService,
    private prisma: PrismaService,
    private copyTrading: CopyTradingService,
    private mt5Sync: Mt5SyncService,
  ) {}

  async onModuleInit() {
    const grace = new Date(Date.now() + WEEKLY_ACCESS_MS);
    const backfill = await this.prisma.user.updateMany({
      where: {
        role: { not: 'ADMIN' },
        status: 'ACTIVE',
        registrationPaid: true,
        accessExpiresAt: null,
      },
      data: { accessExpiresAt: grace },
    });
    if (backfill.count > 0) {
      this.logger.log(
        `Backfilled weekly access expiry for ${backfill.count} active trader(s)`,
      );
    }
    void this.copyTrading.runCopyPoolHealthCheck();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireWeeklyTradingAccessJob() {
    const now = new Date();
    const expired = await this.prisma.user.updateMany({
      where: {
        role: { not: 'ADMIN' },
        status: 'ACTIVE',
        accessExpiresAt: { lt: now },
      },
      data: { status: 'PENDING_PAYMENT' },
    });
    if (expired.count > 0) {
      this.logger.log(
        `Locked ${expired.count} trader(s) — weekly access expired`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshLeaderboardJob() {
    const { weekNumber, year } = currentWeekYear();
    try {
      const entries = await this.leaderboard.refreshLeaderboard(
        weekNumber,
        year,
      );
      this.logger.debug(
        `Leaderboard refreshed: ${entries.length} traders (week ${weekNumber}, ${year})`,
      );
    } catch (err) {
      this.logger.error(
        `Leaderboard refresh failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Monday 00:05 UTC — create payout records for the week that just ended. */
  @Cron('5 0 * * 1')
  async weeklyPayoutsJob() {
    const now = new Date();
    const prev = new Date(now);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const weekNumber = getWeekNumber(prev);
    const year = prev.getFullYear();

    try {
      const created = await this.payouts.calculateWeeklyPayouts(
        weekNumber,
        year,
      );
      this.logger.log(
        `Weekly payouts created: ${created.length} (week ${weekNumber}, ${year})`,
      );
    } catch (err) {
      this.logger.error(
        `Weekly payout job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  @Cron('*/2 * * * *')
  async checkCopyPoolHealthJob() {
    try {
      const health = await this.copyTrading.runCopyPoolHealthCheck();
      if (!health.ready) {
        this.logger.warn(`Copy pool health: ${health.message}`);
      }
    } catch (err) {
      this.logger.error(
        `Copy pool health check failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async manageCopyTradeBreakevenJob() {
    try {
      const result = await this.copyTrading.manageCopyTradeBreakeven();
      if (result.applied > 0) {
        this.logger.log(
          `Copy breakeven: ${result.applied}/${result.checked} position(s) moved to even`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Copy breakeven job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncCopyTradeCommissionsJob() {
    try {
      await this.copyTrading.syncCopyTradeCommissions();
    } catch (err) {
      this.logger.error(
        `Copy trade commission sync failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async deactivateExpiredMt5SyncJob() {
    try {
      await this.mt5Sync.deactivateExpired();
    } catch (err) {
      this.logger.error(
        `MT5 sync expiry job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  @Cron('*/30 * * * * *')
  async pollMt5SyncJob() {
    try {
      const result = await this.mt5Sync.syncAllActiveUsers();
      if (result.users > 0) {
        this.logger.debug(
          `MT5 sync poll: ${result.users} user(s), +${result.imported} imported, ${result.closed} closed, ${result.modified} modified`,
        );
      }
    } catch (err) {
      this.logger.error(
        `MT5 sync poll failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
