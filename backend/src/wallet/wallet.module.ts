import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { SavedWithdrawalWalletService } from './saved-withdrawal-wallet.service';
import { PaymentsModule } from '../payments/payments.module';
import { EmailModule } from '../email/email.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { SoloTradingAdminGuard } from '../auth/guards/solo-trading-admin.guard';

@Module({
  imports: [
    forwardRef(() => PaymentsModule),
    EmailModule,
    ComplianceModule,
    forwardRef(() => FlutterwaveModule),
    forwardRef(() => PayoutsModule),
  ],
  controllers: [WalletController],
  providers: [WalletService, SavedWithdrawalWalletService, SoloTradingAdminGuard],
  exports: [WalletService, SavedWithdrawalWalletService],
})
export class WalletModule {}
