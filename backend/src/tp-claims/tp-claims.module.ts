import { Module } from '@nestjs/common';
import { TpClaimsService } from './tp-claims.service';
import { TpClaimsController } from './tp-claims.controller';
import { TradesModule } from '../trades/trades.module';
import { PayoutsModule } from '../payouts/payouts.module';

@Module({
  imports: [TradesModule, PayoutsModule],
  controllers: [TpClaimsController],
  providers: [TpClaimsService],
  exports: [TpClaimsService],
})
export class TpClaimsModule {}
