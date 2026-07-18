import { Global, Module } from '@nestjs/common';
import { FxRatesService } from './fx-rates.service';

@Global()
@Module({
  providers: [FxRatesService],
  exports: [FxRatesService],
})
export class FxModule {}
