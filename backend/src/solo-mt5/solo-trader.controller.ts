import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { SoloTraderService } from './solo-trader.service';

@Controller('solo/traders')
@UseGuards(JwtAuthGuard)
export class SoloTraderController {
  constructor(private traders: SoloTraderService) {}

  @Get('me')
  me(@Request() req: { user: { id: string } }) {
    return this.traders.getMe(req.user.id);
  }

  @Patch('me/comment')
  setComment(
    @Request() req: { user: { id: string } },
    @Body() body: { comment?: string },
  ) {
    return this.traders.setPreferredComment(
      req.user.id,
      String(body.comment ?? ''),
    );
  }

  @Get()
  list(
    @Request() req: { user: { email?: string | null } },
  ) {
    return this.traders.listForAdmin(req.user.email);
  }

  @Patch(':userId/daily-loss-reset')
  resetDailyLoss(
    @Request() req: { user: { email?: string | null } },
    @Param('userId') userId: string,
  ) {
    return this.traders.resetDailyLoss(req.user.email, userId);
  }

  @Patch(':userId/risk')
  setRisk(
    @Request() req: { user: { email?: string | null } },
    @Param('userId') userId: string,
    @Body() body: { maxRiskPercent?: number },
  ) {
    return this.traders.setMaxRiskPercent(
      req.user.email,
      userId,
      Number(body.maxRiskPercent),
    );
  }
}
