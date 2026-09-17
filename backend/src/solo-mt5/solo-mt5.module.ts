import { Module } from '@nestjs/common';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { MetaApiCloudController } from './metaapi-cloud.controller';
import { SoloMt5Controller } from './solo-mt5.controller';
import { SoloMt5Service } from './solo-mt5.service';

@Module({
  imports: [MetaApiModule],
  controllers: [SoloMt5Controller, MetaApiCloudController],
  providers: [SoloMt5Service],
})
export class SoloMt5Module {}
