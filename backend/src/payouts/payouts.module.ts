import { Module, forwardRef } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutsController } from './payouts.controller';
import { SundayWithdrawBatchService } from './sunday-withdraw-batch.service';
import { PaymentsModule } from '../payments/payments.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';
import { WalletModule } from '../wallet/wallet.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [
    PaymentsModule,
    ProfitShareModule,
    forwardRef(() => WalletModule),
    FlutterwaveModule,
    ReferralsModule,
  ],
  controllers: [PayoutsController],
  providers: [PayoutService, SundayWithdrawBatchService],
  exports: [PayoutService, SundayWithdrawBatchService],
})
export class PayoutsModule {}
