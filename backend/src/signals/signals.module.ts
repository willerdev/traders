import { Module } from '@nestjs/common';
import { SignalsService } from './signals.service';
import { SignalsController } from './signals.controller';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { SignalDraftsService } from './signal-drafts.service';
import { SignalHubService } from './signal-hub.service';
import { AiModule } from '../ai/ai.module';
import { TradesModule } from '../trades/trades.module';
import { TpClaimsModule } from '../tp-claims/tp-claims.module';

@Module({
  imports: [AiModule, TradesModule, TpClaimsModule],
  controllers: [SignalsController],
  providers: [
    SignalsService,
    DuplicateDetectionService,
    SignalDraftsService,
    SignalHubService,
  ],
  exports: [SignalsService],
})
export class SignalsModule {}
