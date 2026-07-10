import { Global, Module, forwardRef } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import {
  ReferralsController,
  AdminReferralsController,
} from './referrals.controller';
import { EmailModule } from '../email/email.module';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';
import { WalletModule } from '../wallet/wallet.module';

@Global()
@Module({
  imports: [
    EmailModule,
    PlatformNotificationsModule,
    forwardRef(() => WalletModule),
  ],
  controllers: [ReferralsController, AdminReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
