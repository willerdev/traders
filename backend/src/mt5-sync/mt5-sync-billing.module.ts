import { Module } from '@nestjs/common';
import { Mt5SyncBillingService } from './mt5-sync-billing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [Mt5SyncBillingService],
  exports: [Mt5SyncBillingService],
})
export class Mt5SyncBillingModule {}
