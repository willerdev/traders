import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WalletService } from '../wallet/wallet.service';
import { InvestorService } from '../investor/investor.service';
import { InvestorYieldScheduleService } from '../investor/investor-yield-schedule.service';
import { ChainEnrollmentService } from '../blockchain/chain-enrollment.service';
import { SundayWithdrawBatchService } from '../payouts/sunday-withdraw-batch.service';
import { isKampalaWeekend } from '../common/kampala-weekend.util';

/** Income + payout crons only — no trader/leaderboard/MT5 jobs. */
@Injectable()
export class SoloPlatformJobsService {
  private readonly logger = new Logger(SoloPlatformJobsService.name);

  constructor(
    private walletService: WalletService,
    private investorService: InvestorService,
    private investorYieldSchedule: InvestorYieldScheduleService,
    private chainEnrollment: ChainEnrollmentService,
    private sundayWithdrawBatch: SundayWithdrawBatchService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Africa/Kampala' })
  async depositorAutoWithdrawJob() {
    try {
      const result = await this.walletService.processDailyAutoWithdrawals();
      if (result.processed > 0 || result.errors > 0) {
        this.logger.log(
          `Depositor auto-withdraw: processed=${result.processed} skipped=${result.skipped} errors=${result.errors} checked=${result.checked}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Depositor auto-withdraw job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

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

  @Cron(CronExpression.EVERY_MINUTE)
  async investorDailyEarningsJob() {
    try {
      if (!(await this.investorYieldSchedule.isYieldDeliveryDue())) return;

      const result = await this.investorService.creditDailyEarnings();
      await this.investorYieldSchedule.markYieldDelivered();

      if (result.credited > 0) {
        this.logger.log(
          `Investor daily earnings credited: ${result.credited} investor(s)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Investor earnings job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  @Cron('0 21 * * *', { timeZone: 'Africa/Kampala' })
  async investorDailyReportJob() {
    try {
      const claimed = await this.investorYieldSchedule.claimDailyReportSend();
      if (!claimed) return;
      const result = await this.investorService.sendDailyReports();
      this.logger.log(
        `Investor daily report emails: sent=${result.sent} skipped=${result.skipped}`,
      );
    } catch (err) {
      this.logger.error(
        `Investor daily report job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  @Cron('10 16 * * *', { timeZone: 'Africa/Kampala' })
  async blockchainVaultDailyProfitJob() {
    try {
      if (isKampalaWeekend()) return;
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

  @Cron('*/5 * * * *')
  async sundayWithdrawBatchJob() {
    try {
      const result = await this.sundayWithdrawBatch.runSundayBatchTick();
      if (
        result.skipped !== 'not_sunday' &&
        result.skipped !== 'already_running'
      ) {
        this.logger.debug(`Sunday withdraw batch: ${JSON.stringify(result)}`);
      }
    } catch (err) {
      this.logger.error(
        `Sunday withdraw batch failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
