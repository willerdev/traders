import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { WalletService } from './wallet.service';
import { SavedWithdrawalWalletService } from './saved-withdrawal-wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(
    private wallet: WalletService,
    private savedWallets: SavedWithdrawalWalletService,
  ) {}

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
    body: {
      network: string;
      amount: number;
      riskPercent?: number;
      method?: 'crypto' | 'momo';
      momoPhone?: string;
      momoNetwork?: string;
      momoCountryCode?: string;
    },
  ) {
    if (body.method === 'momo') {
      return this.wallet.createMomoDeposit(
        req.user.id,
        body.amount,
        {
          phoneNumber: body.momoPhone ?? '',
          network: body.momoNetwork ?? 'MTN',
          countryCode: body.momoCountryCode,
        },
        body.riskPercent,
      );
    }
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

  @Get('daily-calendar')
  @UseGuards(JwtAuthGuard)
  dailyCalendar(
    @Request() req: { user: { id: string } },
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    return this.wallet.getDailyCalendar(
      req.user.id,
      year ? Number(year) : now.getUTCFullYear(),
      month ? Number(month) : now.getUTCMonth() + 1,
    );
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  withdraw(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number; savedWalletId: string },
  ) {
    return this.wallet.withdraw(
      req.user.id,
      body.amount,
      body.savedWalletId,
    );
  }

  @Get('withdrawal-wallets')
  @UseGuards(JwtAuthGuard)
  listWithdrawalWallets(@Request() req: { user: { id: string } }) {
    return this.savedWallets.list(req.user.id);
  }

  @Post('withdrawal-wallets/request-verification')
  @UseGuards(JwtAuthGuard)
  requestWithdrawalWalletVerification(
    @Request() req: { user: { id: string } },
    @Body() body: { label: string; address: string; network: string },
  ) {
    return this.savedWallets.requestVerification(req.user.id, body);
  }

  @Post('withdrawal-wallets/confirm')
  @UseGuards(JwtAuthGuard)
  confirmWithdrawalWallet(
    @Request() req: { user: { id: string } },
    @Body() body: { sessionId: string; code: string },
  ) {
    return this.savedWallets.confirmVerification(
      req.user.id,
      body.sessionId,
      body.code,
    );
  }

  @Delete('withdrawal-wallets/:id')
  @UseGuards(JwtAuthGuard)
  removeWithdrawalWallet(
    @Request() req: { user: { id: string } },
    @Param('id') walletId: string,
  ) {
    return this.savedWallets.remove(req.user.id, walletId);
  }
}
