import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Mt5PoolService } from './mt5-pool.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, MetaApiModule, EmailModule, ConfigModule],
  providers: [Mt5PoolService],
  exports: [Mt5PoolService],
})
export class Mt5PoolModule {}
