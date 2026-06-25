import { Module } from '@nestjs/common';
import { PlatformJobsService } from './platform-jobs.service';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { PayoutsModule } from '../payouts/payouts.module';

@Module({
  imports: [LeaderboardModule, PayoutsModule],
  providers: [PlatformJobsService],
})
export class PlatformModule {}
