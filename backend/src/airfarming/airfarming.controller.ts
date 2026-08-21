import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { AirfarmingService } from './airfarming.service';

@Controller('airfarming')
export class AirfarmingController {
  constructor(private airfarming: AirfarmingService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Request() req: { user: { id: string } }) {
    return this.airfarming.getStatus(req.user.id);
  }

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  apply(@Request() req: { user: { id: string } }) {
    return this.airfarming.apply(req.user.id);
  }

  @Post('allocate')
  @UseGuards(JwtAuthGuard)
  allocate(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number },
  ) {
    return this.airfarming.allocate(req.user.id, body.amount);
  }

  @Post('deallocate')
  @UseGuards(JwtAuthGuard)
  deallocate(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number },
  ) {
    return this.airfarming.deallocate(req.user.id, body.amount);
  }
}
