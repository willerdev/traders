import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { LoansService } from './loans.service';

@Controller('loans')
export class LoansController {
  constructor(private loans: LoansService) {}

  @Get('eligibility')
  @UseGuards(JwtAuthGuard)
  eligibility(@Request() req: { user: { id: string } }) {
    return this.loans.estimateDailyEarning(req.user.id);
  }

  @Get('quote')
  @UseGuards(JwtAuthGuard)
  quote(
    @Request() req: { user: { id: string } },
    @Query('term') term?: string,
  ) {
    return this.loans.quote(req.user.id, term ?? 'WEEKLY');
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Request() req: { user: { id: string } }) {
    return this.loans.listMine(req.user.id);
  }

  @Post('request')
  @UseGuards(JwtAuthGuard)
  request(
    @Request() req: { user: { id: string } },
    @Body() body: { term: string },
  ) {
    return this.loans.request(req.user.id, body.term);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.loans.cancel(req.user.id, id);
  }

  @Post(':id/repay')
  @UseGuards(JwtAuthGuard)
  repay(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.loans.repay(req.user.id, id);
  }
}
