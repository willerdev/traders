import { Module } from '@nestjs/common';
import { VisionService } from './vision.service';
import { SignalValidationService } from './signal-validation.service';
import { SupportAgentService } from './support-agent.service';

@Module({
  providers: [VisionService, SignalValidationService, SupportAgentService],
  exports: [VisionService, SignalValidationService, SupportAgentService],
})
export class AiModule {}
