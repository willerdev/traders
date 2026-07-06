import { Module } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';
import { SignalHubModule } from '../signals/signal-hub.module';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';

@Module({
  imports: [SignalHubModule, PlatformNotificationsModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
