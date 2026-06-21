import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
