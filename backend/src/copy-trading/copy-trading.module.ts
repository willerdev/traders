import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';
import { AdminCopyPoolController } from './copy-trading.controller';
import { CopyTradingService } from './copy-trading.service';

@Module({
  imports: [AuthModule, MetaApiModule, AiModule, LeaderboardModule, ProfitShareModule],
  controllers: [AdminCopyPoolController],
  providers: [CopyTradingService],
  exports: [CopyTradingService],
})
export class CopyTradingModule {}
