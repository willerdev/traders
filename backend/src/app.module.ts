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
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
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
    PlatformModule,
  ],
})
export class AppModule {}
