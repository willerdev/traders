import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { SignalsModule } from '../signals/signals.module';
import { AssistantController } from './assistant.controller';
import { Mt5AssistantService } from './mt5-assistant.service';

@Module({
  imports: [SignalsModule, ComplianceModule],
  controllers: [AssistantController],
  providers: [Mt5AssistantService],
})
export class AssistantModule {}
