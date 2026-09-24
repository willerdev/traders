import { Module, forwardRef } from '@nestjs/common';
import { InvestorService } from './investor.service';
import { InvestorYieldScheduleService } from './investor-yield-schedule.service';
import { InvestorTradingService } from './investor-trading.service';
import { InvestorOptOutService } from './investor-opt-out.service';
import { InvestorController } from './investor.controller';
import { PaymentsModule } from '../payments/payments.module';
import { EmailModule } from '../email/email.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { CopyTradingModule } from '../copy-trading/copy-trading.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    forwardRef(() => PaymentsModule),
    forwardRef(() => WalletModule),
    EmailModule,
    MetaApiModule,
    forwardRef(() => CopyTradingModule),
  ],
  controllers: [InvestorController],
  providers: [
    InvestorService,
    InvestorYieldScheduleService,
    InvestorTradingService,
    InvestorOptOutService,
  ],
  exports: [
    InvestorService,
    InvestorYieldScheduleService,
    InvestorTradingService,
    InvestorOptOutService,
  ],
})
export class InvestorModule {}
