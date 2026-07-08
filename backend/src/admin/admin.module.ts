import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PayoutsModule } from '../payouts/payouts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TpClaimsModule } from '../tp-claims/tp-claims.module';
import { PaymentsModule } from '../payments/payments.module';
import { SignalHubModule } from '../signals/signal-hub.module';
import { SignalsModule } from '../signals/signals.module';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { UploadsModule } from '../uploads/uploads.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { PresenceModule } from '../presence/presence.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';

@Module({
  imports: [
    PayoutsModule,
    AnalyticsModule,
    TpClaimsModule,
    PaymentsModule,
    SignalHubModule,
    SignalsModule,
    MetaApiModule,
    AuthModule,
    MessagesModule,
    UploadsModule,
    PresenceModule,
    WalletModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminPermissionGuard],
})
export class AdminModule {}
