import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { InvestorService } from './investor.service';
import { InvestorOptOutService } from './investor-opt-out.service';

@Controller('investor')
export class InvestorController {
  constructor(
    private investor: InvestorService,
    private optOut: InvestorOptOutService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Request() req: { user: { id: string } }) {
    return this.investor.getStatus(req.user.id);
  }

  @Get('opt-out')
  @UseGuards(JwtAuthGuard)
  optOutStatus(@Request() req: { user: { id: string } }) {
    return this.optOut.getStatus(req.user.id);
  }

  @Post('opt-out/verify-email')
  @UseGuards(JwtAuthGuard)
  sendOptOutVerifyEmail(@Request() req: { user: { id: string } }) {
    return this.optOut.sendVerifyEmail(req.user.id);
  }

  @Post('opt-out')
  @UseGuards(JwtAuthGuard)
  requestOptOut(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      reasonCode?: string;
      reasonNote?: string;
      acknowledged?: boolean;
      verificationCode?: string;
    },
  ) {
    return this.optOut.requestOptOut(req.user.id, body);
  }

  @Get('vip/status')
  @UseGuards(JwtAuthGuard)
  vipStatus(@Request() req: { user: { id: string } }) {
    return this.investor.getVipStatus(req.user.id);
  }

  @Post('vip/upgrade')
  @UseGuards(JwtAuthGuard)
  vipUpgrade(@Request() req: { user: { id: string } }) {
    return this.investor.upgradeVip(req.user.id);
  }

  @Post('enroll/checkout')
  @UseGuards(JwtAuthGuard)
  enrollCheckout(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      network?: string;
      source?: 'wallet' | 'crypto';
      investmentAmount?: number;
    },
  ) {
    return this.investor.createEnrollmentCheckout(
      req.user.id,
      body.network ?? 'TRC20',
      body.source ?? 'crypto',
      body.investmentAmount,
    );
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  updateSettings(
    @Request() req: { user: { id: string } },
    @Body() body: { riskPercent: number },
  ) {
    return this.investor.updateSettings(req.user.id, body.riskPercent);
  }

  @Post('pause')
  @UseGuards(JwtAuthGuard)
  pause(@Request() req: { user: { id: string } }) {
    return this.investor.setPaused(req.user.id, true);
  }

  @Post('resume')
  @UseGuards(JwtAuthGuard)
  resume(@Request() req: { user: { id: string } }) {
    return this.investor.setPaused(req.user.id, false);
  }

  @Post('auto-reinvest')
  @UseGuards(JwtAuthGuard)
  setAutoReinvest(
    @Request() req: { user: { id: string } },
    @Body() body: { enabled: boolean },
  ) {
    return this.investor.setAutoReinvestEarnings(
      req.user.id,
      Boolean(body.enabled),
    );
  }

  @Post('allocate')
  @UseGuards(JwtAuthGuard)
  allocate(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number },
  ) {
    return this.investor.transferInvestment(
      req.user.id,
      Number(body.amount),
      'to_investment',
    );
  }

  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  redeem(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number },
  ) {
    return this.investor.transferInvestment(
      req.user.id,
      Number(body.amount),
      'to_wallet',
    );
  }
}
