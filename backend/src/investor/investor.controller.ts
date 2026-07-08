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

@Controller('investor')
export class InvestorController {
  constructor(private investor: InvestorService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Request() req: { user: { id: string } }) {
    return this.investor.getStatus(req.user.id);
  }

  @Post('enroll/checkout')
  @UseGuards(JwtAuthGuard)
  enrollCheckout(
    @Request() req: { user: { id: string } },
    @Body() body: { network: string },
  ) {
    return this.investor.createEnrollmentCheckout(req.user.id, body.network);
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
}
