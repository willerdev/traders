import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { ComplianceModule } from './compliance/compliance.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SignalsModule } from './signals/signals.module';
import { TpClaimsModule } from './tp-claims/tp-claims.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PaymentsModule } from './payments/payments.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { UploadsModule } from './uploads/uploads.module';
import { TradesModule } from './trades/trades.module';
import { AdminModule } from './admin/admin.module';
import { MessagesModule } from './messages/messages.module';
import { EmailModule } from './email/email.module';
import { PlatformModule } from './platform/platform.module';
import { PlatformNotificationsModule } from './platform-notifications/platform-notifications.module';
import { FeedsModule } from './feeds/feeds.module';
import { AssistantModule } from './assistant/assistant.module';
import { ProfitShareModule } from './profit-share/profit-share.module';
import { MarketingModule } from './marketing/marketing.module';
import { ReferralsModule } from './referrals/referrals.module';
import { Mt5SyncModule } from './mt5-sync/mt5-sync.module';
import { PublicModule } from './public/public.module';
import { PresenceModule } from './presence/presence.module';
import { WalletModule } from './wallet/wallet.module';
import { InvestorModule } from './investor/investor.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { FlutterwaveModule } from './flutterwave/flutterwave.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EmailModule,
    PrismaModule,
    ComplianceModule,
    AuthModule,
    UsersModule,
    SignalsModule,
    TpClaimsModule,
    LeaderboardModule,
    PayoutsModule,
    PaymentsModule,
    AnalyticsModule,
    UploadsModule,
    TradesModule,
    AdminModule,
    MessagesModule,
    PlatformModule,
    PlatformNotificationsModule,
    FeedsModule,
    AssistantModule,
    ProfitShareModule,
    MarketingModule,
    ReferralsModule,
    Mt5SyncModule,
    PublicModule,
    PresenceModule,
    WalletModule,
    InvestorModule,
    EvaluationsModule,
    FlutterwaveModule,
  ],
})
export class AppModule {}
