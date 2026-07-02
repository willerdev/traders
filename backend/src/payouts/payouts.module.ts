import { Module } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutsController } from './payouts.controller';
import { PaymentsModule } from '../payments/payments.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';

@Module({
  imports: [PaymentsModule, ProfitShareModule],
  controllers: [PayoutsController],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutsModule {}
