import { Module, forwardRef } from '@nestjs/common';
import { UnitrustService } from './unitrust.service';
import { UnitrustController } from './unitrust.controller';
import { WalletModule } from '../wallet/wallet.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [forwardRef(() => WalletModule), EmailModule],
  controllers: [UnitrustController],
  providers: [UnitrustService],
  exports: [UnitrustService],
})
export class UnitrustModule {}
