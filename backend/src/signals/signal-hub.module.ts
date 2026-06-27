import { Module } from '@nestjs/common';
import { SignalHubService } from './signal-hub.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  providers: [SignalHubService],
  exports: [SignalHubService],
})
export class SignalHubModule {}
