import { Module } from '@nestjs/common';
import { VisionService } from './vision.service';
import { SignalValidationService } from './signal-validation.service';

@Module({
  providers: [VisionService, SignalValidationService],
  exports: [VisionService, SignalValidationService],
})
export class AiModule {}
