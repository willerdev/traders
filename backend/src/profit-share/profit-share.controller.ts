import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { ProfitShareService } from './profit-share.service';

@Controller('profit-share')
@UseGuards(JwtAuthGuard)
export class ProfitShareController {
  constructor(private profitShare: ProfitShareService) {}

  @Get('status')
  getStatus(@Request() req: { user: { id: string } }) {
    return this.profitShare.getStatus(req.user.id);
  }
}
