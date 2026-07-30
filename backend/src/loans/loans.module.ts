import { Module, forwardRef } from '@nestjs/common';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { WalletModule } from '../wallet/wallet.module';
import { EmailModule } from '../email/email.module';
import { ComplianceModule } from '../compliance/compliance.module';

@Module({
  imports: [
    forwardRef(() => WalletModule),
    EmailModule,
    ComplianceModule,
  ],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
