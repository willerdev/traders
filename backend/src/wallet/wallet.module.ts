import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { SavedWithdrawalWalletService } from './saved-withdrawal-wallet.service';
import { PaymentsModule } from '../payments/payments.module';
import { EmailModule } from '../email/email.module';
import { ComplianceModule } from '../compliance/compliance.module';

@Module({
  imports: [
    forwardRef(() => PaymentsModule),
    EmailModule,
    ComplianceModule,
  ],
  controllers: [WalletController],
  providers: [WalletService, SavedWithdrawalWalletService],
  exports: [WalletService, SavedWithdrawalWalletService],
})
export class WalletModule {}
