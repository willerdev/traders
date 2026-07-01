import { Module } from '@nestjs/common';
import { SignalsModule } from '../signals/signals.module';
import { AssistantController } from './assistant.controller';
import { Mt5AssistantService } from './mt5-assistant.service';

@Module({
  imports: [SignalsModule],
  controllers: [AssistantController],
  providers: [Mt5AssistantService],
})
export class AssistantModule {}
