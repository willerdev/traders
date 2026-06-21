import { Module } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutsController } from './payouts.controller';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [PayoutsController],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutsModule {}
