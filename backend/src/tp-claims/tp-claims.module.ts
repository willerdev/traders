import { Module, forwardRef } from '@nestjs/common';
import { TpClaimsService } from './tp-claims.service';
import { TpClaimsController } from './tp-claims.controller';
import { TradesModule } from '../trades/trades.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { EmailModule } from '../email/email.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';

@Module({
  imports: [
    TradesModule,
    // PayoutsModule is often still evaluating when this file loads via
    // Payments → Evaluations → Mt5Sync → Signals → TpClaims.
    forwardRef(() => PayoutsModule),
    MetaApiModule,
    EmailModule,
    ProfitShareModule,
  ],
  controllers: [TpClaimsController],
  providers: [TpClaimsService],
  exports: [TpClaimsService],
})
export class TpClaimsModule {}
