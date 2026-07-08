import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private wallet: WalletService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  summary(@Request() req: { user: { id: string } }) {
    return this.wallet.getSummary(req.user.id);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  transactions(
    @Request() req: { user: { id: string } },
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.wallet.getTransactions(
      req.user.id,
      take ? Number(take) : 50,
      skip ? Number(skip) : 0,
    );
  }

  @Get('deposit/minimum')
  @UseGuards(JwtAuthGuard)
  depositMinimum(@Query('network') network?: string) {
    return this.wallet.getDepositMinimum(network ?? 'TRC20');
  }

  @Get('deposit/preview')
  @UseGuards(JwtAuthGuard)
  preview(
    @Query('amount') amount: string,
    @Query('riskPercent') riskPercent: string,
  ) {
    return this.wallet.previewDepositPlan(
      Number(amount),
      Number(riskPercent),
    );
  }

  @Post('deposit')
  @UseGuards(JwtAuthGuard)
  deposit(
    @Request() req: { user: { id: string } },
    @Body()
    body: { network: string; amount: number; riskPercent?: number },
  ) {
    return this.wallet.createDeposit(
      req.user.id,
      body.network,
      body.amount,
      body.riskPercent,
    );
  }

  @Post('deposit/plan')
  @UseGuards(JwtAuthGuard)
  createPlan(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number; riskPercent: number },
  ) {
    return this.wallet.createPlan(
      req.user.id,
      body.amount,
      body.riskPercent,
    );
  }

  @Get('income-journal')
  @UseGuards(JwtAuthGuard)
  incomeJournal(
    @Request() req: { user: { id: string } },
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.wallet.getDailyIncomeJournal(
      req.user.id,
      take ? Number(take) : 50,
      skip ? Number(skip) : 0,
    );
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  withdraw(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number; walletAddress?: string },
  ) {
    return this.wallet.withdraw(
      req.user.id,
      body.amount,
      body.walletAddress,
    );
  }
}
