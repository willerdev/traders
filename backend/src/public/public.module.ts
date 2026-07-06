import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PayoutsModule } from '../payouts/payouts.module';

@Module({
  imports: [PayoutsModule],
  controllers: [PublicController],
})
export class PublicModule {}
