import { Module } from '@nestjs/common';
import { SignalsService } from './signals.service';
import { SignalsController } from './signals.controller';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { SignalDraftsService } from './signal-drafts.service';
import { SignalHubModule } from './signal-hub.module';
import { AiModule } from '../ai/ai.module';
import { TradesModule } from '../trades/trades.module';
import { TpClaimsModule } from '../tp-claims/tp-claims.module';
import { MetaApiModule } from '../metaapi/metaapi.module';

@Module({
  imports: [
    AiModule,
    TradesModule,
    TpClaimsModule,
    SignalHubModule,
    MetaApiModule,
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
