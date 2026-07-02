import { Module } from '@nestjs/common';
import { PlatformJobsService } from './platform-jobs.service';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [LeaderboardModule, PayoutsModule, PrismaModule],
  providers: [PlatformJobsService],
})
export class PlatformModule {}
