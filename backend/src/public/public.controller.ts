import { Controller, Get, Query } from '@nestjs/common';
import { PayoutService } from '../payouts/payout.service';

@Controller('public')
export class PublicController {
  constructor(private payouts: PayoutService) {}

  @Get('recent-payouts')
  getRecentPayouts(@Query('limit') limit?: string) {
    const take = limit ? parseInt(limit, 10) : 12;
    return this.payouts.getRecentPublicPayouts(take);
  }
}
