import { Module } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutsController } from './payouts.controller';
import { PaymentsModule } from '../payments/payments.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';
import { WalletModule } from '../wallet/wallet.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';

@Module({
  imports: [PaymentsModule, ProfitShareModule, WalletModule, FlutterwaveModule],
  controllers: [PayoutsController],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutsModule {}
