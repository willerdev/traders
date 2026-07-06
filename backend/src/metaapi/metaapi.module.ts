import { Module } from '@nestjs/common';
import { MetaApiService } from './metaapi.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  providers: [MetaApiService],
  exports: [MetaApiService],
})
export class MetaApiModule {}
