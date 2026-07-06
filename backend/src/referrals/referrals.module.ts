import { Global, Module } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import {
  ReferralsController,
  AdminReferralsController,
} from './referrals.controller';
import { EmailModule } from '../email/email.module';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';

@Global()
@Module({
  imports: [EmailModule, PlatformNotificationsModule],
  controllers: [ReferralsController, AdminReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
