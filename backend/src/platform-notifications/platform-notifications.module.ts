import { Module } from '@nestjs/common';
import { PlatformNotificationsService } from './platform-notifications.service';
import { PlatformNotificationsController } from './platform-notifications.controller';

@Module({
  controllers: [PlatformNotificationsController],
  providers: [PlatformNotificationsService],
  exports: [PlatformNotificationsService],
})
export class PlatformNotificationsModule {}
