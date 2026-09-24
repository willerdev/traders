import { Module } from '@nestjs/common';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { DerivModule } from '../deriv/deriv.module';
import { MetaApiCloudController } from './metaapi-cloud.controller';
import { SoloMt5Controller } from './solo-mt5.controller';
import { SoloMt5Service } from './solo-mt5.service';
import { SoloTradingAdminGuard } from '../auth/guards/solo-trading-admin.guard';

@Module({
  imports: [MetaApiModule, DerivModule],
  controllers: [SoloMt5Controller, MetaApiCloudController],
  providers: [SoloMt5Service, SoloTradingAdminGuard],
  exports: [SoloMt5Service],
})
export class SoloMt5Module {}
