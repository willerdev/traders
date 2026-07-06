import { Module, forwardRef } from '@nestjs/common';
import { Mt5SyncService } from './mt5-sync.service';
import {
  AdminMt5SyncController,
  Mt5SyncController,
} from './mt5-sync.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { SignalsModule } from '../signals/signals.module';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { Mt5SyncBillingModule } from './mt5-sync-billing.module';

@Module({
  imports: [
    PrismaModule,
    MetaApiModule,
    forwardRef(() => SignalsModule),
    AiModule,
    AuthModule,
    PlatformNotificationsModule,
    Mt5SyncBillingModule,
  ],
  controllers: [Mt5SyncController, AdminMt5SyncController],
  providers: [Mt5SyncService],
  exports: [Mt5SyncService],
})
export class Mt5SyncModule {}
