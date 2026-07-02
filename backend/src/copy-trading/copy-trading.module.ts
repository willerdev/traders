import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';
import { CopyTradingService } from './copy-trading.service';

@Module({
  imports: [MetaApiModule, AiModule, LeaderboardModule, ProfitShareModule],
  providers: [CopyTradingService],
  exports: [CopyTradingService],
})
export class CopyTradingModule {}
