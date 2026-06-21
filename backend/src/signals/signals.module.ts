import { Module } from '@nestjs/common';
import { SignalsService } from './signals.service';
import { SignalsController } from './signals.controller';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { SignalDraftsService } from './signal-drafts.service';

@Module({
  controllers: [SignalsController],
  providers: [SignalsService, DuplicateDetectionService, SignalDraftsService],
  exports: [SignalsService],
})
export class SignalsModule {}
