import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { EmailModule } from '../email/email.module';
import { AirfarmingService } from './airfarming.service';
import { AirfarmingController } from './airfarming.controller';
import { AirfarmingAdminController } from './airfarming-admin.controller';

@Module({
  imports: [PrismaModule, WalletModule, EmailModule],
  controllers: [AirfarmingController, AirfarmingAdminController],
  providers: [AirfarmingService],
  exports: [AirfarmingService],
})
export class AirfarmingModule {}
