import { Module } from '@nestjs/common';
import { Mt5PoolService } from './mt5-pool.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MetaApiModule } from '../metaapi/metaapi.module';

@Module({
  imports: [PrismaModule, MetaApiModule],
  providers: [Mt5PoolService],
  exports: [Mt5PoolService],
})
export class Mt5PoolModule {}
