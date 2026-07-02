import { Module } from '@nestjs/common';
import { ProfitShareService } from './profit-share.service';
import { ProfitShareController } from './profit-share.controller';

@Module({
  controllers: [ProfitShareController],
  providers: [ProfitShareService],
  exports: [ProfitShareService],
})
export class ProfitShareModule {}
