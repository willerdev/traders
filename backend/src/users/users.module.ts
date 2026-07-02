import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';

@Module({
  imports: [MetaApiModule, ProfitShareModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
