import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
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
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
