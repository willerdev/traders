import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PayoutsModule } from '../payouts/payouts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TpClaimsModule } from '../tp-claims/tp-claims.module';
import { PaymentsModule } from '../payments/payments.module';
import { SignalHubModule } from '../signals/signal-hub.module';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    PayoutsModule,
    AnalyticsModule,
    TpClaimsModule,
    PaymentsModule,
    SignalHubModule,
    AuthModule,
    MessagesModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
