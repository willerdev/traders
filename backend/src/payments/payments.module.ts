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
import { ProfitShareModule } from '../profit-share/profit-share.module';
import { Mt5SyncBillingModule } from '../mt5-sync/mt5-sync-billing.module';
import { Mt5PoolModule } from '../mt5-sync/mt5-pool.module';

@Module({
  imports: [AuthModule, EmailModule, ProfitShareModule, Mt5SyncBillingModule, Mt5PoolModule],
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
