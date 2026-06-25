import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { PayoutService } from '../payouts/payout.service';

function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

@Injectable()
export class PlatformJobsService {
  private readonly logger = new Logger(PlatformJobsService.name);

  constructor(
    private leaderboard: LeaderboardService,
    private payouts: PayoutService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshLeaderboardJob() {
    const now = new Date();
    const weekNumber = getWeekNumber(now);
    const year = now.getFullYear();
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
}
