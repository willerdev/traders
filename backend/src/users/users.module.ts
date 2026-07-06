import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';
import { Mt5PoolModule } from '../mt5-sync/mt5-pool.module';

@Module({
  imports: [MetaApiModule, ProfitShareModule, Mt5PoolModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
