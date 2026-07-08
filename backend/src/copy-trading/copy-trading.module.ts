import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';
import {
  AdminCopyPoolController,
  AdminCopySettingsController,
} from './copy-trading.controller';
import { CopyTradeRiskService } from './copy-trade-risk.service';
import { CopyTradingService } from './copy-trading.service';

@Module({
  imports: [
    AuthModule,
    EmailModule,
    MetaApiModule,
    LeaderboardModule,
    ProfitShareModule,
  ],
  controllers: [AdminCopyPoolController, AdminCopySettingsController],
  providers: [CopyTradeRiskService, CopyTradingService],
  exports: [CopyTradingService, CopyTradeRiskService],
})
export class CopyTradingModule {}
