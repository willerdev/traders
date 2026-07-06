import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from './admin.service';
import { CreatePromoCodeDto, SendMessageDto, AdminRejectReasonDto } from '../common/dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { UploadStorageService } from '../uploads/upload-storage.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private uploadStorage: UploadStorageService,
  ) {}

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('payment-forecast')
  getPaymentForecast() {
    return this.adminService.getPaymentForecast();
  }

  @Get('kyc/pending')
  listPendingKyc() {
    return this.adminService.listPendingKyc();
  }

  @Post('kyc/:userId/approve')
  approveKyc(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approveKyc(userId, req.user.id);
  }

  @Post('kyc/:userId/reject')
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
  ) {
    return this.adminService.listUsers(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
      suspicious === 'true' || suspicious === '1',
    );
  }

  @Get('users/:userId')
  getUser(@Param('userId') userId: string) {
    return this.adminService.getUserDetail(userId);
  }

  @Get('signals')
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

  @Post('signals/:signalId/approve-tp1-claim-email')
  approveTp1ClaimEmail(
    @Param('signalId') signalId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approveTp1ClaimEmail(signalId, req.user.id);
  }

  @Get('payouts')
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
  getPayoutCustodyDeposit(@Param('depositId') depositId: string) {
    return this.adminService.getCustodyDepositStatus(depositId);
  }

  @Post('payouts/:payoutId/approve')
  approvePayout(
    @Param('payoutId') payoutId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approvePayout(payoutId, req.user.id);
  }

  @Post('payouts/:payoutId/verify')
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
  listPendingTpClaims() {
    return this.adminService.listPendingTpClaims();
  }

  @Post('tp-claims/:claimId/approve')
  approveTpClaim(
    @Param('claimId') claimId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approveTpClaim(claimId, req.user.id);
  }

  @Post('tp-claims/:claimId/reject')
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

  @Post('promo-codes')
  createPromoCode(
    @Request() req: { user: { id: string } },
    @Body() dto: CreatePromoCodeDto,
  ) {
    return this.adminService.createPromoCode(req.user.id, dto);
  }

  @Post('promo-codes/:code/deactivate')
  deactivatePromoCode(
    @Param('code') code: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.deactivatePromoCode(req.user.id, code);
  }

  @Get('hub/metaapi/copy-dashboard')
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
  getSetupUpload(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.uploadStorage.sendFile('setups', filename, res);
  }

  @Get('uploads/kyc/:filename')
  getKycUpload(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.uploadStorage.sendFile('kyc', filename, res);
  }
}
