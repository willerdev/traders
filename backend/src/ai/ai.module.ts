import { Module } from '@nestjs/common';
import { VisionService } from './vision.service';
import { SignalValidationService } from './signal-validation.service';
import { SupportAgentService } from './support-agent.service';
import { TradeRiskService } from './trade-risk.service';
import { MetaApiModule } from '../metaapi/metaapi.module';

@Module({
  imports: [MetaApiModule],
  providers: [
    VisionService,
    SignalValidationService,
    SupportAgentService,
    TradeRiskService,
  ],
  exports: [
    VisionService,
    SignalValidationService,
    SupportAgentService,
    TradeRiskService,
  ],
})
export class AiModule {}
