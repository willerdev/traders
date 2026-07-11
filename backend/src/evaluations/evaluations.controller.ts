import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { EvaluationsService } from './evaluations.service';

@Controller('evaluations')
export class EvaluationsController {
  constructor(private evaluations: EvaluationsService) {}

  @Get('plans')
  listPlans() {
    return this.evaluations.listPlans();
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  getActive(@Request() req: { user: { id: string } }) {
    return this.evaluations.getActiveEnrollment(req.user.id);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  getHistory(@Request() req: { user: { id: string } }) {
    return this.evaluations.getHistory(req.user.id);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@Request() req: { user: { id: string } }) {
    return this.evaluations.listMine(req.user.id);
  }

  @Post(':id/select')
  @UseGuards(JwtAuthGuard)
  selectEnrollment(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.evaluations.selectEnrollment(req.user.id, id);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      type: string;
      variant: string;
      planId: string;
      network: string;
      source?: 'wallet' | 'crypto';
    },
  ) {
    return this.evaluations.createCheckout(req.user.id, body);
  }
}
