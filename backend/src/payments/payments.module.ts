import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { NowPaymentsService } from './nowpayments.service';
import { PromoService } from './promo.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, NowPaymentsService, PromoService],
  exports: [PaymentsService, NowPaymentsService, PromoService],
})
export class PaymentsModule {}
