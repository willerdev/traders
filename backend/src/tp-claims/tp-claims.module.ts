import { Module } from '@nestjs/common';
import { TpClaimsService } from './tp-claims.service';
import { TpClaimsController } from './tp-claims.controller';
import { TradesModule } from '../trades/trades.module';
import { MetaApiModule } from '../metaapi/metaapi.module';
import { EmailModule } from '../email/email.module';
import { ProfitShareModule } from '../profit-share/profit-share.module';

@Module({
  imports: [
    TradesModule,
    MetaApiModule,
    EmailModule,
    ProfitShareModule,
  ],
  controllers: [TpClaimsController],
  providers: [TpClaimsService],
  exports: [TpClaimsService],
})
export class TpClaimsModule {}
