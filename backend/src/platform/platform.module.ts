import { Module } from '@nestjs/common';
import { PlatformJobsService } from './platform-jobs.service';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CopyTradingModule } from '../copy-trading/copy-trading.module';

@Module({
  imports: [LeaderboardModule, PayoutsModule, PrismaModule, CopyTradingModule],
  providers: [PlatformJobsService],
})
export class PlatformModule {}
