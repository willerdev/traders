import { Global, Module } from '@nestjs/common';
import { FxRatesService } from './fx-rates.service';
import { BinanceC2cService } from './binance-c2c.service';

@Global()
@Module({
  providers: [FxRatesService, BinanceC2cService],
  exports: [FxRatesService, BinanceC2cService],
})
export class FxModule {}
