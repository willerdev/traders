import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PriceMonitorService } from './price-monitor.service';
import { ScoringService } from '../scoring/scoring.service';

@Module({
  providers: [WalletService, PriceMonitorService, ScoringService],
  exports: [WalletService, PriceMonitorService],
})
export class TradesModule {}
