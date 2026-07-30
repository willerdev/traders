import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { UnitrustService } from './unitrust.service';

@Controller('unitrust')
export class UnitrustController {
  constructor(private unitrust: UnitrustService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Request() req: { user: { id: string } }) {
    return this.unitrust.getStatus(req.user.id);
  }

  @Post('enroll')
  @UseGuards(JwtAuthGuard)
  enroll(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number },
  ) {
    return this.unitrust.enrollFromWallet(req.user.id, body.amount);
  }

  @Post('allocate')
  @UseGuards(JwtAuthGuard)
  allocate(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number },
  ) {
    return this.unitrust.allocate(req.user.id, body.amount);
  }

  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  redeem(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number },
  ) {
    return this.unitrust.redeem(req.user.id, body.amount);
  }
}
