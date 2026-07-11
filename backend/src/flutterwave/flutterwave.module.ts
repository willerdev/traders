import { Module, forwardRef } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { FlutterwavePaymentsService } from './flutterwave-payments.service';
import { FlutterwaveController } from './flutterwave.controller';
import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    forwardRef(() => PaymentsModule),
    forwardRef(() => WalletModule),
  ],
  controllers: [FlutterwaveController],
  providers: [FlutterwaveService, FlutterwavePaymentsService],
  exports: [FlutterwaveService, FlutterwavePaymentsService],
})
export class FlutterwaveModule {}
