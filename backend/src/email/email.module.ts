import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationService } from './notification.service';

@Global()
@Module({
  providers: [EmailService, NotificationService],
  exports: [EmailService, NotificationService],
})
export class EmailModule {}
