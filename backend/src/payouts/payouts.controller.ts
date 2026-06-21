import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PayoutService } from './payout.service';
import { RequestPayoutDto } from '../common/dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(private payoutService: PayoutService) {}

  @Get()
  getHistory(@Request() req: { user: { id: string } }) {
    return this.payoutService.getPayoutHistory(req.user.id);
  }

  @Post('request')
  requestPayout(
    @Request() req: { user: { id: string } },
    @Body() dto: RequestPayoutDto,
  ) {
    return this.payoutService.requestPayout(
      req.user.id,
      dto.payoutId,
      dto.walletAddress,
    );
  }

  @Post('approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  approve(
    @Request() req: { user: { id: string } },
    @Body('payoutId') payoutId: string,
  ) {
    return this.payoutService.approvePayout(payoutId, req.user.id);
  }
}
