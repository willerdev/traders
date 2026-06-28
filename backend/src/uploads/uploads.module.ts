import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadStorageService } from './upload-storage.service';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AiModule, PrismaModule],
  controllers: [UploadsController],
  providers: [UploadStorageService],
  exports: [UploadStorageService],
})
export class UploadsModule {}
