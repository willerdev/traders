import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards';
import { FlutterwavePaymentsService } from './flutterwave-payments.service';
import { FlutterwaveService } from './flutterwave.service';

@Controller('flutterwave')
export class FlutterwaveController {
  private readonly logger = new Logger(FlutterwaveController.name);

  constructor(
    private flwPayments: FlutterwavePaymentsService,
    private flw: FlutterwaveService,
  ) {}

  @Get('config')
  config() {
    return this.flwPayments.getPublicConfig();
  }

  /** Webhook setup info — register this URL in the Flutterwave dashboard. */
  @Get('webhook')
  webhookInfo() {
    return this.flwPayments.getWebhookInfo();
  }

  /** Flutterwave sends charge + transfer feedback here (POST). */
  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Req() req: RawBodyRequest<ExpressRequest>,
    @Body() body: Record<string, unknown>,
  ) {
    const signature = req.headers['flutterwave-signature'] as string | undefined;
    const raw = req.rawBody ?? JSON.stringify(body);

    if (!this.flw.verifyWebhookSignature(raw, signature)) {
      this.logger.warn('Rejected Flutterwave webhook — invalid signature');
      throw new UnauthorizedException('Invalid Flutterwave webhook signature');
    }

    return this.flwPayments.handleWebhook(body as {
      id?: string;
      type?: string;
      timestamp?: number;
      data?: {
        id?: string;
        status?: string;
        reference?: string;
        amount?: number;
        currency?: string;
      };
    });
  }

  @Get('payments/:paymentId/status')
  @UseGuards(JwtAuthGuard)
  paymentStatus(
    @Request() req: { user: { id: string } },
    @Param('paymentId') paymentId: string,
  ) {
    return this.flwPayments.syncPaymentById(paymentId, req.user.id);
  }
}
