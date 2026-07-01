import { Module } from '@nestjs/common';
import { FeedsController } from './feeds.controller';
import { FeedsService } from './feeds.service';
import { FeedsApiKeyGuard } from './feeds-api-key.guard';

@Module({
  controllers: [FeedsController],
  providers: [FeedsService, FeedsApiKeyGuard],
  exports: [FeedsService],
})
export class FeedsModule {}
