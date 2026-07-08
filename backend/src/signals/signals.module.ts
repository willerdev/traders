import { Module, forwardRef } from '@nestjs/common';
import { SignalsService } from './signals.service';
import { SignalsController } from './signals.controller';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { SignalDraftsService } from './signal-drafts.service';
import { SignalHubModule } from './signal-hub.module';
import { AiModule } from '../ai/ai.module';
import { TradesModule } from '../trades/trades.module';
import { TpClaimsModule } from '../tp-claims/tp-claims.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { EmailModule } from '../email/email.module';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';
import { CopyTradingModule } from '../copy-trading/copy-trading.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { Mt5PoolModule } from '../mt5-sync/mt5-pool.module';
import { InvestorModule } from '../investor/investor.module';

@Module({
  imports: [
    AiModule,
    TradesModule,
    forwardRef(() => TpClaimsModule),
    SignalHubModule,
    MetaApiModule,
    EmailModule,
    PlatformNotificationsModule,
    CopyTradingModule,
    LeaderboardModule,
    Mt5PoolModule,
    forwardRef(() => InvestorModule),
  ],
  controllers: [SignalsController],
  providers: [
    SignalsService,
    DuplicateDetectionService,
    SignalDraftsService,
  ],
  exports: [SignalsService],
})
export class SignalsModule {}
