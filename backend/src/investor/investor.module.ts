import { Module, forwardRef } from '@nestjs/common';
import { InvestorService } from './investor.service';
import { InvestorTradingService } from './investor-trading.service';
import { InvestorController } from './investor.controller';
import { PaymentsModule } from '../payments/payments.module';
import { EmailModule } from '../email/email.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { CopyTradingModule } from '../copy-trading/copy-trading.module';

@Module({
  imports: [
    PaymentsModule,
    EmailModule,
    MetaApiModule,
    forwardRef(() => CopyTradingModule),
  ],
  controllers: [InvestorController],
  providers: [InvestorService, InvestorTradingService],
  exports: [InvestorService, InvestorTradingService],
})
export class InvestorModule {}
