import { Module } from '@nestjs/common';
import { DerivController } from './deriv.controller';
import { DerivService } from './deriv.service';
import { SoloTradingAdminGuard } from '../auth/guards/solo-trading-admin.guard';

@Module({
  controllers: [DerivController],
  providers: [DerivService, SoloTradingAdminGuard],
  exports: [DerivService],
})
export class DerivModule {}
