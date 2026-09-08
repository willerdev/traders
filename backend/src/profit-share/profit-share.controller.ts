import { Controller, Get, GoneException, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { ProfitShareService } from './profit-share.service';

@Controller('profit-share')
@UseGuards(JwtAuthGuard)
export class ProfitShareController {
  constructor(private profitShare: ProfitShareService) {}

  @Get('status')
  getStatus(@Request() req: { user: { id: string } }) {
    void req;
    throw new GoneException(
      'Profit share has been discontinued. Smart Invest, wallet, and core trading remain available.',
    );
  }
}
