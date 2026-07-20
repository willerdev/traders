import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from './admin.service';
import { CreatePromoCodeDto, BulkCreatePromoCodesDto, SendMessageDto, AdminRejectReasonDto, UpdateStaffPermissionsDto } from '../common/dto';
import { JwtAuthGuard, AdminPermissionGuard } from '../auth/guards';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { UploadStorageService } from '../uploads/upload-storage.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
@RequireAdminPermission('full')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private uploadStorage: UploadStorageService,
  ) {}

  @Get('session')
  @RequireAdminPermission('hub')
  getSession(@Request() req: { user: { id: string } }) {
    return this.adminService.getAdminSession(req.user.id);
  }

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('presence/live')
  getLivePresence() {
    return this.adminService.getLivePresence();
  }

  @Get('payment-forecast')
  getPaymentForecast() {
    return this.adminService.getPaymentForecast();
  }

  @Get('kyc/pending')
  @RequireAdminPermission('kyc')
  listPendingKyc() {
    return this.adminService.listPendingKyc();
  }

  @Get('kyc/list')
  @RequireAdminPermission('kyc')
  listKyc(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listKyc(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
      status,
    );
  }

  @Post('kyc/:userId/approve')
  @RequireAdminPermission('kyc')
  approveKyc(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approveKyc(userId, req.user.id);
  }

  @Post('kyc/:userId/reject')
  @RequireAdminPermission('kyc')
  rejectKyc(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
    @Body() dto: AdminRejectReasonDto,
  ) {
    return this.adminService.rejectKyc(
      userId,
      req.user.id,
      dto.reason?.trim() || 'Documents unclear',
    );
  }

  @Get('users')
  listUsers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('suspicious') suspicious?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listUsers(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
      suspicious === 'true' || suspicious === '1',
      search,
    );
  }

  @Get('users/:userId')
  getUser(@Param('userId') userId: string) {
    return this.adminService.getUserDetail(userId);
  }

  @Get('payments')
  listPayments(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('purpose') purpose?: string,
    @Query('method') method?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listPayments(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
      { status, purpose, method, search },
    );
  }

  @Patch('users/:userId/staff-permissions')
  updateStaffPermissions(
    @Param('userId') userId: string,
    @Body() dto: UpdateStaffPermissionsDto,
  ) {
    return this.adminService.updateStaffPermissions(userId, dto);
  }

  @Get('signals')
  @RequireAdminPermission('full', 'setup')
  listSignals(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listSignals(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
      status,
    );
  }

  @Post('signals/:signalId/set-limit')
  setSetupLimit(@Param('signalId') signalId: string) {
    return this.adminService.setSetupLimit(signalId);
  }

  @Post('signals/:signalId/mirror-copy')
  @RequireAdminPermission('full', 'setup')
  mirrorSetupToCopy(@Param('signalId') signalId: string) {
    return this.adminService.mirrorSetupToCopy(signalId);
  }

  @Post('signals/:signalId/approve-tp1-claim-email')
  approveTp1ClaimEmail(
    @Param('signalId') signalId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approveTp1ClaimEmail(signalId, req.user.id);
  }

  @Get('payouts')
  @RequireAdminPermission('payout')
  listPayouts(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listPayouts(
      status,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
  }

  @Get('payouts/pending')
  @RequireAdminPermission('payout')
  listPendingPayouts() {
    return this.adminService.listPendingPayouts();
  }

  @Get('payouts/weekly-tiers/settings')
  getWeeklyTierPayoutSettings() {
    return this.adminService.getWeeklyTierPayoutSettings();
  }

  @Post('payouts/weekly-tiers/settings')
  updateWeeklyTierPayoutSettings(@Body('enabled') enabled: boolean) {
    return this.adminService.setWeeklyTierPayoutsEnabled(Boolean(enabled));
  }

  @Get('payouts/custody/wallet')
  @RequireAdminPermission('payout')
  getPayoutCustodyWallet() {
    return this.adminService.getNowPaymentsWallet();
  }

  @Post('payouts/custody/deposit')
  createPayoutCustodyDeposit(
    @Request() req: { user: { id: string } },
    @Body('amount') amount: number,
    @Body('network') network: string,
  ) {
    return this.adminService.createCustodyDeposit(
      req.user.id,
      Number(amount),
      network || 'TRC20',
    );
  }

  @Get('payouts/custody/deposits')
  @RequireAdminPermission('payout')
  listPayoutCustodyDeposits(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('sync') sync?: string,
  ) {
    return this.adminService.listCustodyDeposits(
      limit ? Number(limit) : undefined,
      status,
      sync === 'true' || sync === '1',
    );
  }

  @Post('payouts/custody/deposits/sync-all')
  syncAllCustodyDeposits() {
    return this.adminService.syncAllCustodyDeposits();
  }

  @Post('payouts/custody/deposits/:depositId/sync')
  syncCustodyDeposit(@Param('depositId') depositId: string) {
    return this.adminService.syncCustodyDeposit(depositId);
  }

  @Get('payouts/custody/deposits/:depositId')
  @RequireAdminPermission('payout')
  getPayoutCustodyDeposit(@Param('depositId') depositId: string) {
    return this.adminService.getCustodyDepositStatus(depositId);
  }

  @Post('payouts/:payoutId/approve')
  @RequireAdminPermission('payout')
  approvePayout(
    @Param('payoutId') payoutId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approvePayout(payoutId, req.user.id);
  }

  @Post('payouts/:payoutId/verify')
  @RequireAdminPermission('payout')
  verifyPayout(
    @Param('payoutId') payoutId: string,
    @Request() req: { user: { id: string } },
    @Body('code') code: string,
  ) {
    return this.adminService.verifyNowPaymentsPayout(
      payoutId,
      code,
      req.user.id,
    );
  }

  @Post('payouts/:payoutId/refund')
  @RequireAdminPermission('payout')
  refundPayout(
    @Param('payoutId') payoutId: string,
    @Request() req: { user: { id: string } },
    @Body('reason') reason?: string,
  ) {
    return this.adminService.refundPayout(payoutId, req.user.id, reason);
  }

  @Get('nowpayments/wallet')
  getNowPaymentsWallet() {
    return this.adminService.getNowPaymentsWallet();
  }

  @Post('nowpayments/deposit')
  createCustodyDeposit(
    @Request() req: { user: { id: string } },
    @Body('amount') amount: number,
    @Body('network') network: string,
  ) {
    return this.adminService.createCustodyDeposit(
      req.user.id,
      Number(amount),
      network || 'TRC20',
    );
  }

  @Get('nowpayments/deposits')
  listCustodyDeposits(@Query('limit') limit?: string) {
    return this.adminService.listCustodyDeposits(
      limit ? Number(limit) : undefined,
    );
  }

  @Get('nowpayments/deposits/:depositId')
  getCustodyDeposit(@Param('depositId') depositId: string) {
    return this.adminService.getCustodyDepositStatus(depositId);
  }

  @Get('tp-claims/pending')
  @RequireAdminPermission('tp_claim')
  listPendingTpClaims() {
    return this.adminService.listPendingTpClaims();
  }

  @Post('tp-claims/:claimId/approve')
  @RequireAdminPermission('tp_claim')
  approveTpClaim(
    @Param('claimId') claimId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approveTpClaim(claimId, req.user.id);
  }

  @Post('tp-claims/:claimId/reject')
  @RequireAdminPermission('tp_claim')
  rejectTpClaim(
    @Param('claimId') claimId: string,
    @Request() req: { user: { id: string } },
    @Body('reason') reason: string,
  ) {
    return this.adminService.rejectTpClaim(
      claimId,
      req.user.id,
      reason || 'Evidence did not confirm take profit',
    );
  }

  @Get('promo-codes')
  listPromoCodes() {
    return this.adminService.listPromoCodes();
  }

  @Get('promo-codes/usage')
  listPromoUsage() {
    return this.adminService.listPromoUsage();
  }

  @Post('promo-codes')
  createPromoCode(
    @Request() req: { user: { id: string } },
    @Body() dto: CreatePromoCodeDto,
  ) {
    return this.adminService.createPromoCode(req.user.id, dto);
  }

  @Post('promo-codes/bulk')
  bulkCreatePromoCodes(
    @Request() req: { user: { id: string } },
    @Body() dto: BulkCreatePromoCodesDto,
  ) {
    return this.adminService.bulkCreatePromoCodes(req.user.id, dto);
  }

  @Post('promo-codes/:code/deactivate')
  deactivatePromoCode(
    @Param('code') code: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.deactivatePromoCode(req.user.id, code);
  }

  @Get('hub/metaapi/copy-dashboard')
  @RequireAdminPermission('full', 'copy')
  getCopyTradingDashboard(
    @Query('includeTerminal') includeTerminal?: string,
  ) {
    const include =
      includeTerminal === undefined ||
      includeTerminal === '' ||
      includeTerminal === '1' ||
      includeTerminal === 'true';
    return this.adminService.getCopyTradingDashboard(include);
  }

  @Get('hub/metaapi/terminal')
  getMetaApiTerminal(@Query('accountId') accountId?: string) {
    return this.adminService.getMetaApiTerminal(accountId);
  }

  @Get('hub/metaapi/accounts')
  listMetaApiAccounts(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
    @Query('deploymentStatus') deploymentStatus?: string,
  ) {
    return this.adminService.listMetaApiAccounts({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      search,
      deploymentStatus,
    });
  }

  @Get('hub/metaapi/accounts/:accountId')
  getMetaApiAccount(@Param('accountId') accountId: string) {
    return this.adminService.getMetaApiAccount(accountId);
  }

  @Get('hub/senders/report')
  hubSenderReport(
    @Query('days') days?: string,
    @Query('sort') sort?: string,
    @Query('min_closed_trades') minClosedTrades?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getHubSenderReport({
      days: days ? parseInt(days, 10) : undefined,
      sort,
      min_closed_trades: minClosedTrades
        ? parseInt(minClosedTrades, 10)
        : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('users/:userId/suspend')
  suspendUser(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
    @Body('reason') reason: string,
  ) {
    return this.adminService.suspendUser(
      userId,
      req.user.id,
      reason || 'Policy violation',
    );
  }

  @Post('users/:userId/ban')
  banUser(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
    @Body('reason') reason: string,
  ) {
    return this.adminService.banUser(
      userId,
      req.user.id,
      reason || 'Unrealistic or invalid email address',
    );
  }

  @Post('users/ban-suspicious')
  banSuspiciousUsers(
    @Request() req: { user: { id: string } },
    @Body() body: { userIds: string[]; reason?: string },
  ) {
    return this.adminService.banSuspiciousUsers(
      req.user.id,
      body.userIds ?? [],
      body.reason || 'Unrealistic or invalid email address',
    );
  }

  @Post('users/:userId/registration/approve')
  approveRegistration(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approveRegistrationPayment(userId, req.user.id);
  }

  @Post('users/:userId/registration/deny')
  denyRegistration(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
    @Body() dto: AdminRejectReasonDto,
  ) {
    return this.adminService.denyRegistrationPayment(
      userId,
      req.user.id,
      dto.reason?.trim() || 'Registration payment not accepted',
    );
  }

  @Get('messages/threads')
  listMessageThreads() {
    return this.adminService.listMessageThreads();
  }

  @Get('messages/unread-count')
  messagesUnreadCount() {
    return this.adminService.getMessagesUnreadTotal();
  }

  @Get('messages/users/:userId')
  getMessageThread(
    @Param('userId') userId: string,
    @Query('since') since?: string,
  ) {
    return this.adminService.getMessageThread(userId, since);
  }

  @Post('messages/users/:userId')
  sendMessageToUser(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
    @Body() dto: SendMessageDto,
  ) {
    return this.adminService.sendMessageToUser(req.user.id, userId, dto);
  }

  @Get('uploads/setups/:filename')
  @RequireAdminPermission('full', 'setup')
  getSetupUpload(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.uploadStorage.sendFile('setups', filename, res);
  }

  @Get('uploads/kyc/:filename')
  @RequireAdminPermission('kyc')
  getKycUpload(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.uploadStorage.sendFile('kyc', filename, res);
  }

  @Get('platform/investor-depositor-settings')
  getInvestorDepositorSettings() {
    return this.adminService.getInvestorDepositorSettings();
  }

  @Patch('platform/investor-depositor-settings')
  updateInvestorDepositorSettings(
    @Body()
    body: {
      investorFeeUsdt?: number;
      investorDailyYieldPercent?: number;
      investorYieldPaused?: boolean;
      depositorDailyYieldPercent?: number;
      depositorMinDepositUsdt?: number;
      loginOtpEnabled?: boolean;
    },
  ) {
    return this.adminService.updateInvestorDepositorSettings(body);
  }

  @Post('investors/enroll')
  enrollInvestor(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      userId?: string;
      email?: string;
      investmentAmount: number;
      source?: 'wallet' | 'comp';
      note?: string;
    },
  ) {
    return this.adminService.enrollInvestor(req.user.id, body);
  }

  @Get('investors')
  listInvestors(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listInvestors(
      search,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
  }

  @Patch('investors/:userId/yield')
  updateInvestorYield(
    @Param('userId') userId: string,
    @Body() body: { dailyYieldPercent: number | null },
  ) {
    return this.adminService.updateInvestorYield(userId, body.dailyYieldPercent);
  }

  @Patch('investors/:userId/yield-pause')
  setInvestorYieldPaused(
    @Param('userId') userId: string,
    @Body() body: { paused: boolean },
  ) {
    return this.adminService.setInvestorYieldPaused(
      userId,
      body.paused === true,
    );
  }

  @Post('investors/:userId/transfer')
  transferInvestorFunds(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
    @Body()
    body: { amount: number; direction: 'to_investment' | 'to_wallet' },
  ) {
    return this.adminService.transferInvestorFunds(
      userId,
      req.user.id,
      Number(body.amount),
      body.direction,
    );
  }

  @Get('income-journal')
  getIncomeJournal(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('userId') userId?: string,
    @Query('source') source?: 'INVESTOR' | 'DEPOSITOR',
  ) {
    return this.adminService.getIncomeJournal(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
      userId,
      source,
    );
  }

  @Post('wallet/credit')
  creditUserWallet(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      userId?: string;
      email?: string;
      amount: number;
      description?: string;
    },
  ) {
    return this.adminService.creditUserWallet(req.user.id, body);
  }

  @Post('system-signals')
  publishSystemSignal(
    @Body()
    body: {
      symbol: string;
      direction: 'BUY' | 'SELL';
      entryMin: number;
      entryMax: number;
      stopLoss: number;
      description?: string;
      openPrice?: number;
    },
  ) {
    return this.adminService.publishSystemSignal(body);
  }
}
