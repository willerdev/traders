import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Headers,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { PayoutService } from './payout.service';
import { RequestPayoutDto } from '../common/dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { NowPaymentsService } from '../payments/nowpayments.service';

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(
    private payoutService: PayoutService,
    private nowPayments: NowPaymentsService,
  ) {}

  @Get('reward-tier')
  getRewardTier(@Request() req: { user: { id: string } }) {
    return this.payoutService.getRewardTier(req.user.id);
  }

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

  @Post('ipn')
  async handleIpn(
    @Req() req: RawBodyRequest<ExpressRequest>,
    @Body() body: Record<string, unknown>,
    @Headers('x-nowpayments-sig') signature?: string,
  ) {
    const raw = req.rawBody?.toString() || JSON.stringify(body);
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET?.trim();

    if (!ipnSecret) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Payout IPN is not configured');
      }
    } else if (
      !signature ||
      !this.nowPayments.verifyIpnSignature(raw, signature)
    ) {
      throw new UnauthorizedException('Invalid IPN signature');
    }

    return this.payoutService.handlePayoutIpn(body);
  }
}
