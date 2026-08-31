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
import { PayoutService } from '../payouts/payout.service';

@Controller('wallet')
export class WalletController {
  constructor(
    private wallet: WalletService,
    private savedWallets: SavedWithdrawalWalletService,
    private payouts: PayoutService,
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

  @Post('daily-calendar/report')
  @UseGuards(JwtAuthGuard)
  sendDailyCalendarReport(
    @Request() req: { user: { id: string } },
    @Body() body: { year?: number; month?: number },
  ) {
    const now = new Date();
    return this.wallet.sendMonthlyJournalReport(
      req.user.id,
      body.year ? Number(body.year) : now.getUTCFullYear(),
      body.month ? Number(body.month) : now.getUTCMonth() + 1,
    );
  }

  @Post('withdraw/request-otp')
  @UseGuards(JwtAuthGuard)
  requestWithdrawOtp(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number; savedWalletId: string },
  ) {
    return this.wallet.requestWithdrawOtp(
      req.user.id,
      body.amount,
      body.savedWalletId,
    );
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  withdraw(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      amount: number;
      savedWalletId: string;
      sessionId?: string;
      code?: string;
      pin?: string;
    },
  ) {
    return this.wallet.withdraw(req.user.id, body.amount, body.savedWalletId, {
      sessionId: body.sessionId,
      code: body.code,
      pin: body.pin,
    });
  }

  @Get('pending-withdrawals')
  @UseGuards(JwtAuthGuard)
  pendingWithdrawals(@Request() req: { user: { id: string } }) {
    return this.payouts.listPendingWalletWithdrawals(req.user.id);
  }

  @Post('withdrawals/:id/cancel')
  @UseGuards(JwtAuthGuard)
  cancelWithdrawal(
    @Request() req: { user: { id: string } },
    @Param('id') payoutId: string,
  ) {
    return this.payouts.cancelPendingWithdrawalByUser(req.user.id, payoutId);
  }

  @Get('momo-p2p/quote')
  @UseGuards(JwtAuthGuard)
  momoP2pQuote(@Query('amountUsdt') amountUsdt?: string) {
    return this.wallet.quoteMomoP2p(Number(amountUsdt));
  }

  @Get('momo-p2p')
  @UseGuards(JwtAuthGuard)
  listMomoP2p(@Request() req: { user: { id: string } }) {
    return this.wallet.listMomoP2pForUser(req.user.id);
  }

  @Get('momo-p2p/:id')
  @UseGuards(JwtAuthGuard)
  getMomoP2p(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.wallet.getMomoP2pForUser(req.user.id, id);
  }

  @Post('momo-p2p/:id/confirm-received')
  @UseGuards(JwtAuthGuard)
  confirmMomoP2pReceived(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.wallet.confirmMomoP2pReceived(req.user.id, id);
  }

  @Post('transfer/request-otp')
  @UseGuards(JwtAuthGuard)
  requestTransferOtp(
    @Request() req: { user: { id: string } },
    @Body() body: { recipientEmail?: string; amount?: number },
  ) {
    return this.wallet.requestTransferOtp(
      req.user.id,
      body.recipientEmail ?? '',
      Number(body.amount),
    );
  }

  @Post('transfer/confirm')
  @UseGuards(JwtAuthGuard)
  confirmTransfer(
    @Request() req: { user: { id: string } },
    @Body() body: { sessionId?: string; otpId?: string; code?: string },
  ) {
    return this.wallet.confirmTransfer(
      req.user.id,
      body.sessionId ?? body.otpId ?? '',
      body.code ?? '',
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
