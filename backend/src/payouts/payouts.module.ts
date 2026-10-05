import { Module, forwardRef } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { PayoutsController } from './payouts.controller';
import { SundayWithdrawBatchService } from './sunday-withdraw-batch.service';
import { StaffPayoutDispatchService } from './staff-payout-dispatch.service';
import { PaymentsModule } from '../payments/payments.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';
import { WalletModule } from '../wallet/wallet.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { BinanceWeb3Module } from '../binance-web3/binance-web3.module';

@Module({
  imports: [
    PaymentsModule,
    ProfitShareModule,
    forwardRef(() => WalletModule),
    FlutterwaveModule,
    ReferralsModule,
    BinanceWeb3Module,
  ],
  controllers: [PayoutsController],
  providers: [
    PayoutService,
    SundayWithdrawBatchService,
    StaffPayoutDispatchService,
  ],
  exports: [
    PayoutService,
    SundayWithdrawBatchService,
    StaffPayoutDispatchService,
  ],
})
export class PayoutsModule {}
