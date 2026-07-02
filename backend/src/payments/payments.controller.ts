import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Headers,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto,
  ApplyPromoDto,
  CreateSetupPlanPaymentDto,
  CreateProfitSharePaymentDto,
} from '../common/dto';
import { JwtAuthGuard } from '../auth/guards';
import { NowPaymentsService } from './nowpayments.service';
import { CustodyDepositService } from './custody-deposit.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private nowPayments: NowPaymentsService,
    private custodyDeposits: CustodyDepositService,
  ) {}

  @Post('registration')
  @UseGuards(JwtAuthGuard)
  createRegistration(
    @Request() req: { user: { id: string } },
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.createRegistrationPayment(
      req.user.id,
      dto.network,
      dto.promoCode,
    );
  }

  @Post('setup-plan')
  @UseGuards(JwtAuthGuard)
  createSetupPlanPayment(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateSetupPlanPaymentDto,
  ) {
    return this.paymentsService.createSetupPlanPayment(
      req.user.id,
      dto.network,
      dto.plan,
    );
  }

  @Post('profit-share')
  @UseGuards(JwtAuthGuard)
  createProfitSharePayment(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateProfitSharePaymentDto,
  ) {
    return this.paymentsService.createProfitSharePayment(
      req.user.id,
      dto.network,
    );
  }

  @Get('profit-share/status')
  @UseGuards(JwtAuthGuard)
  getProfitShareStatus(@Request() req: { user: { id: string } }) {
    return this.paymentsService.getProfitSharePaymentStatus(req.user.id);
  }

  @Get('setup-plan/status')
  @UseGuards(JwtAuthGuard)
  getSetupPlanStatus(@Request() req: { user: { id: string } }) {
    return this.paymentsService.getSetupPlanStatus(req.user.id);
  }

  @Post('apply-promo')
  @UseGuards(JwtAuthGuard)
  applyPromo(
    @Request() req: { user: { id: string } },
    @Body() dto: ApplyPromoDto,
  ) {
    return this.paymentsService.applyPromoCode(req.user.id, dto.code);
  }

  @Get('promo/validate')
  @UseGuards(JwtAuthGuard)
  validatePromo(@Query('code') code: string) {
    return this.paymentsService.validatePromoCode(code);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  getHistory(@Request() req: { user: { id: string } }) {
    return this.paymentsService.getPaymentHistory(req.user.id);
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  getWallet(@Request() req: { user: { id: string } }) {
    return this.paymentsService.getWalletTransactions(req.user.id);
  }

  @Get(':paymentId/status')
  @UseGuards(JwtAuthGuard)
  getStatus(
    @Request() req: { user: { id: string } },
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentsService.getPaymentStatus(req.user.id, paymentId);
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
        throw new UnauthorizedException('Payment IPN is not configured');
      }
    } else if (
      !signature ||
      !this.nowPayments.verifyIpnSignature(raw, signature)
    ) {
      throw new UnauthorizedException('Invalid IPN signature');
    }

    return this.routeIpn(
      body as Parameters<PaymentsService['handleIpn']>[0],
    );
  }

  private routeIpn(body: {
    payment_id?: number;
    payment_status?: string;
    order_id?: string;
    pay_address?: string;
    actually_paid?: number;
    outcome_amount?: number;
  }) {
    const orderId = body.order_id;
    if (orderId && this.custodyDeposits.isCustodyOrderId(orderId)) {
      return this.custodyDeposits.handleIpn(body);
    }
    return this.paymentsService.handleIpn(body);
  }
}
