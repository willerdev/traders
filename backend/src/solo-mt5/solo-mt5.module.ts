import { Module } from '@nestjs/common';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { DerivModule } from '../deriv/deriv.module';
import { MetaApiCloudController } from './metaapi-cloud.controller';
import { SoloMt5Controller } from './solo-mt5.controller';
import { SoloTraderController } from './solo-trader.controller';
import { SoloMt5Service } from './solo-mt5.service';
import { SoloTraderService } from './solo-trader.service';
import { SoloTradingAdminGuard } from '../auth/guards/solo-trading-admin.guard';

@Module({
  imports: [MetaApiModule, DerivModule],
  controllers: [SoloMt5Controller, MetaApiCloudController, SoloTraderController],
  providers: [SoloMt5Service, SoloTraderService, SoloTradingAdminGuard],
  exports: [SoloMt5Service, SoloTraderService],
})
export class SoloMt5Module {}
