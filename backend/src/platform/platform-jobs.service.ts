import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { PayoutService } from '../payouts/payout.service';
import { PrismaService } from '../prisma/prisma.service';
import { CopyTradingService } from '../copy-trading/copy-trading.service';
import { Mt5SyncService } from '../mt5-sync/mt5-sync.service';
import { currentWeekYear, getWeekNumber } from '../common/week.util';

import { WalletService } from '../wallet/wallet.service';
import { InvestorService } from '../investor/investor.service';
import { InvestorYieldScheduleService } from '../investor/investor-yield-schedule.service';
import { UnitrustService } from '../unitrust/unitrust.service';
import { AirfarmingService } from '../airfarming/airfarming.service';
import { AbuseHunterService } from './abuse-hunter.service';
import { AccountTransferService } from '../account-transfer/account-transfer.service';
import { ChainEnrollmentService } from '../blockchain/chain-enrollment.service';
import { isKampalaWeekend } from '../common/kampala-weekend.util';
import { SundayWithdrawBatchService } from '../payouts/sunday-withdraw-batch.service';
import { isSundayUtc } from '../payouts/sunday-withdraw-batch.util';
import {
  MAX_RISK_PER_TRADE,
  RISK_PERCENT,
  STARTING_BALANCE,
} from '../common/constants';

@Injectable()
export class PlatformJobsService implements OnModuleInit {
  private readonly logger = new Logger(PlatformJobsService.name);

  constructor(
    private leaderboard: LeaderboardService,
    private payouts: PayoutService,
    private prisma: PrismaService,
    private copyTrading: CopyTradingService,
    private mt5Sync: Mt5SyncService,
    private walletService: WalletService,
    private investorService: InvestorService,
    private investorYieldSchedule: InvestorYieldScheduleService,
    private unitrustService: UnitrustService,
    private airfarmingService: AirfarmingService,
    private abuseHunter: AbuseHunterService,
    private accountTransfers: AccountTransferService,
    private chainEnrollment: ChainEnrollmentService,
    private sundayWithdrawBatch: SundayWithdrawBatchService,
  ) {}

  async onModuleInit() {
    await this.grandfatherPendingPaymentTraders();
    await this.grandfatherFreeMt5Sync();
    void this.copyTrading.runCopyPoolHealthCheck();
    void this.abuseHunter.runHunt('startup').then((result) => {
      if (result.bannedCount > 0) {
        this.logger.warn(
          `Abuse hunter startup: banned ${result.bannedCount} account(s)`,
        );
      }
    });
    if (isSundayUtc()) {
      void this.sundayWithdrawBatch.runSundayBatchTick().then((result) => {
        this.logger.log(
          `Sunday withdraw batch startup tick: ${JSON.stringify(result)}`,
        );
      });
    } else {
      void this.sundayWithdrawBatch.runSundayBatchTick().then((result) => {
        if (result.skipped !== 'not_sunday') {
          this.logger.log(
            `Sunday withdraw batch resume tick: ${JSON.stringify(result)}`,
          );
        }
      });
    }
  }

  /** Weekly access billing removed — activate legacy pending traders. */
  private async grandfatherPendingPaymentTraders() {
    const pending = await this.prisma.user.findMany({
      where: {
        role: { not: 'ADMIN' },
        status: 'PENDING_PAYMENT',
      },
      select: { id: true },
    });
    if (pending.length === 0) return;

    for (const user of pending) {
      const va = await this.prisma.virtualAccount.findUnique({
        where: { userId: user.id },
      });
      if (!va) {
        await this.prisma.virtualAccount.create({
          data: {
            userId: user.id,
            balance: STARTING_BALANCE,
            maxRiskPerTrade: MAX_RISK_PER_TRADE,
            riskPercent: RISK_PERCENT,
          },
        });
      }
    }

    const updated = await this.prisma.user.updateMany({
      where: {
        role: { not: 'ADMIN' },
        status: 'PENDING_PAYMENT',
      },
      data: {
        status: 'ACTIVE',
        registrationPaid: true,
      },
    });
    if (updated.count > 0) {
      this.logger.log(
        `Grandfathered ${updated.count} trader(s) — weekly access fee discontinued`,
      );
    }
  }

  /** MT5 sync subscription removed — enable sync for linked accounts. */
  private async grandfatherFreeMt5Sync() {
    const updated = await this.prisma.user.updateMany({
      where: {
        metaApiAccountId: { not: null },
        OR: [{ mt5SyncActive: false }, { mt5SyncEnabled: false }],
      },
      data: {
        mt5SyncActive: true,
        mt5SyncEnabled: true,
      },
    });
    if (updated.count > 0) {
      this.logger.log(
        `Enabled free MT5 Live Sync for ${updated.count} linked account(s)`,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireWeeklyTradingAccessJob() {
    // Weekly access billing discontinued — no-op.
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async huntAbusiveAccountsJob() {
    try {
      const result = await this.abuseHunter.runHunt('cron');
      if (result.bannedCount > 0) {
        this.logger.warn(
          `Abuse hunter banned ${result.bannedCount} account(s) (scanned ${result.scanned})`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Abuse hunter failed: ${err instanceof Error ? err.message : err}`,
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
      const tierEnabled = await this.payouts.isWeeklyTierPayoutsEnabled();
      const created = await this.payouts.calculateWeeklyPayouts(
        weekNumber,
        year,
      );
      this.logger.log(
        `Weekly payouts created: ${created.length} (week ${weekNumber}, ${year}, tier payouts ${tierEnabled ? 'enabled' : 'disabled'})`,
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
    // MT5 sync subscription billing discontinued — no-op.
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

  /** Daily at 00:10 UTC — credit depositor plan earnings. */
  @Cron('10 0 * * *')
  async depositorDailyEarningsJob() {
    try {
      const result = await this.walletService.creditDailyEarnings();
      if (result.credited > 0) {
        this.logger.log(
          `Depositor daily earnings credited: ${result.credited} plan day(s)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Depositor earnings job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Every minute — Smart Invest yield at a random Kampala weekday time (13:00–18:59). */
  @Cron(CronExpression.EVERY_MINUTE)
  async investorDailyEarningsJob() {
    try {
      if (!(await this.investorYieldSchedule.isYieldDeliveryDue())) return;

      const result = await this.investorService.creditDailyEarnings();
      await this.investorYieldSchedule.markYieldDelivered();

      if (result.credited > 0) {
        this.logger.log(
          `Investor daily earnings credited: ${result.credited} investor(s)` +
            (result.weekendSkipped
              ? ` (${result.weekendSkipped} weekend skip)`
              : '') +
            (result.holdSkipped
              ? ` (${result.holdSkipped} under 24h hold)`
              : ''),
        );
      } else if (result.skipped === 'global_pause') {
        this.logger.warn(
          'Investor daily earnings skipped — global yield pause',
        );
      } else {
        this.logger.log('Investor daily earnings tick — no eligible credits');
      }

      // Unitrust follows Smart Invest delivery on the same tick.
      void this.unitrustDailyEarningsJob();
    } catch (err) {
      this.logger.error(
        `Investor earnings job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Daily at 21:00 Africa/Kampala — Smart Invest daily summary email. */
  @Cron('0 21 * * *', { timeZone: 'Africa/Kampala' })
  async investorDailyReportJob() {
    try {
      const claimed = await this.investorYieldSchedule.claimDailyReportSend();
      if (!claimed) {
        this.logger.debug('Investor daily report already sent today');
        return;
      }

      const result = await this.investorService.sendDailyReports();
      this.logger.log(
        `Investor daily report emails: sent=${result.sent} skipped=${result.skipped} total=${result.total}`,
      );
    } catch (err) {
      this.logger.error(
        `Investor daily report job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Credits Unitrust 5% daily earnings — invoked after Smart Invest yield delivery. */
  async unitrustDailyEarningsJob() {
    try {
      const result = await this.unitrustService.creditDailyEarnings();
      if (result.credited > 0) {
        this.logger.log(
          `Unitrust daily earnings credited: ${result.credited} member(s)` +
            (result.holdSkipped
              ? ` (${result.holdSkipped} under 24h hold)`
              : ''),
        );
      } else if (result.skipped === 'global_pause') {
        this.logger.warn(
          'Unitrust daily earnings skipped — global yield pause',
        );
      }
    } catch (err) {
      this.logger.error(
        `Unitrust earnings job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Daily at 16:10 Africa/Kampala — accrue locked blockchain wallet profit. */
  @Cron('10 16 * * *', { timeZone: 'Africa/Kampala' })
  async blockchainVaultDailyProfitJob() {
    try {
      if (isKampalaWeekend()) {
        this.logger.log(
          'Blockchain wallet daily profits skipped — weekend (Kampala)',
        );
        return;
      }
      const result = await this.chainEnrollment.creditDailyVaultProfits();
      if (result.credited > 0) {
        this.logger.log(
          `Blockchain wallet daily profits credited: ${result.credited}/${result.checked}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Blockchain wallet profit job failed: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  /** Hourly — expire VIP and send renewal reminders. */
  @Cron(CronExpression.EVERY_HOUR)
  async investorVipMaintenanceJob() {
    try {
      const result = await this.investorService.maintainVipSubscriptions();
      if (result.expired > 0 || result.reminded > 0) {
        this.logger.log(
          `VIP maintenance: expired=${result.expired}, reminded=${result.reminded}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `VIP maintenance failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Every 15 minutes — finalize account transfers past the 24h review hold. */
  @Cron('*/15 * * * *')
  async accountTransferFinalizeJob() {
    try {
      const result = await this.accountTransfers.finalizeDue();
      if (result.processed > 0) {
        this.logger.log(
          `Account transfers finalized: completed=${result.completed} failed=${result.failed}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Account transfer finalize job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Every minute — settle Airfarming drops and run cash ↔ AF float. */
  @Cron(CronExpression.EVERY_MINUTE)
  async airfarmingMinuteJob() {
    try {
      const result = await this.airfarmingService.runMinuteJobs();
      if (result.settled > 0 || result.floated > 0) {
        this.logger.log(
          `Airfarming minute job: settled=${result.settled} floated=${result.floated}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Airfarming minute job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Every 5 minutes — Sunday batch queue/approve/finalize (continues until batch closes). */
  @Cron('*/5 * * * *')
  async sundayWithdrawBatchJob() {
    try {
      const result = await this.sundayWithdrawBatch.runSundayBatchTick();
      if (
        result.skipped !== 'not_sunday' &&
        result.skipped !== 'already_running'
      ) {
        const parts: string[] = [];
        if (result.queued?.queued) {
          parts.push(`queued=${result.queued.queued}`);
        }
        if (result.approved?.approved) {
          parts.push(`approved=${result.approved.payoutId}`);
        }
        if (result.finalized?.finalized) {
          parts.push('finalized=true');
        }
        if (parts.length > 0) {
          this.logger.log(`Sunday withdraw batch: ${parts.join(' ')}`);
        }
      }
    } catch (err) {
      this.logger.error(
        `Sunday withdraw batch failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Hourly — ensure next natural Airfarming drop exists for active users. */
  @Cron(CronExpression.EVERY_HOUR)
  async airfarmingHourlyJob() {
    try {
      const result = await this.airfarmingService.runHourlyJobs();
      if (result.scheduled > 0) {
        this.logger.log(
          `Airfarming hourly job: scheduled=${result.scheduled}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Airfarming hourly job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
