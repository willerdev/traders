import { Module, forwardRef } from '@nestjs/common';
import { VisionService } from './vision.service';
import { SignalValidationService } from './signal-validation.service';
import { SupportAgentService } from './support-agent.service';
import { TradeRiskService } from './trade-risk.service';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { InvestorModule } from '../investor/investor.module';
import { PayoutsModule } from '../payouts/payouts.module';

@Module({
  imports: [
    MetaApiModule,
    forwardRef(() => InvestorModule),
    forwardRef(() => PayoutsModule),
  ],
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
