import { Module, forwardRef } from '@nestjs/common';
import { EvaluationsService } from './evaluations.service';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationMonitorService } from './evaluation-monitor.service';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from '../auth/auth.module';
import { Mt5SyncModule } from '../mt5-sync/mt5-sync.module';
import { WalletModule } from '../wallet/wallet.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';

@Module({
  imports: [
    forwardRef(() => PaymentsModule),
    AuthModule,
    Mt5SyncModule,
    forwardRef(() => WalletModule),
    forwardRef(() => FlutterwaveModule),
  ],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, EvaluationMonitorService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
