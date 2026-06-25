import { Module } from '@nestjs/common';
import { TpClaimsService } from './tp-claims.service';
import { TpClaimsController } from './tp-claims.controller';
import { TradesModule } from '../trades/trades.module';

@Module({
  imports: [TradesModule],
  controllers: [TpClaimsController],
  providers: [TpClaimsService],
  exports: [TpClaimsService],
})
export class TpClaimsModule {}
