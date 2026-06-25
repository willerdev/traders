import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AiModule, PrismaModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
