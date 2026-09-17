import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { ComplianceModule } from './compliance/compliance.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadsModule } from './uploads/uploads.module';
import { EmailModule } from './email/email.module';
import { PlatformNotificationsModule } from './platform-notifications/platform-notifications.module';
import { ReferralsModule } from './referrals/referrals.module';
import { WalletModule } from './wallet/wallet.module';
import { InvestorModule } from './investor/investor.module';
import { FlutterwaveModule } from './flutterwave/flutterwave.module';
import { FxModule } from './fx/fx.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { DerivModule } from './deriv/deriv.module';
import { SoloMt5Module } from './solo-mt5/solo-mt5.module';
import { SoloPlatformModule } from './platform/solo-platform.module';
import { HealthController } from './health/health.controller';
import { markSoloApp } from './common/app-variant';

markSoloApp();

/**
 * Trade Guard Solo — wallet, Smart Invest, contract, payouts.
 * Trader/community modules are omitted.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EmailModule,
    PrismaModule,
    FxModule,
    ComplianceModule,
    AuthModule,
    UsersModule,
    PlatformNotificationsModule,
    ReferralsModule,
    PayoutsModule,
    PaymentsModule,
    UploadsModule,
    WalletModule,
    InvestorModule,
    FlutterwaveModule,
    BlockchainModule,
    DerivModule,
    SoloMt5Module,
    SoloPlatformModule,
  ],
  controllers: [HealthController],
})
export class SoloAppModule {}
