import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PayoutsModule } from '../payouts/payouts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TpClaimsModule } from '../tp-claims/tp-claims.module';

@Module({
  imports: [PayoutsModule, AnalyticsModule, TpClaimsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
