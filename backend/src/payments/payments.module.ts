import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { NowPaymentsService } from './nowpayments.service';
import { CustodyDepositService } from './custody-deposit.service';
import { BlockchainScannerService } from './blockchain-scanner.service';
import { PaymentMonitorService } from './payment-monitor.service';
import { PromoService } from './promo.service';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    NowPaymentsService,
    CustodyDepositService,
    BlockchainScannerService,
    PaymentMonitorService,
    PromoService,
  ],
  exports: [
    PaymentsService,
    NowPaymentsService,
    CustodyDepositService,
    BlockchainScannerService,
    PromoService,
  ],
})
export class PaymentsModule {}
