import { Module } from '@nestjs/common';
import { DerivController } from './deriv.controller';
import { DerivService } from './deriv.service';

@Module({
  controllers: [DerivController],
  providers: [DerivService],
})
export class DerivModule {}
