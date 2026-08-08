import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { BlockchainService } from './blockchain.service';
import { ChainEnrollmentService } from './chain-enrollment.service';
import { KycAiService } from './kyc-ai.service';

type AuthedRequest = { user: { id: string; role: UserRole } };

/**
 * REST façade matching the planned contract surface.
 * Prefixed with /blockchain to avoid colliding with platform /wallet.
 */
@Controller('blockchain')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlockchainController {
  constructor(
    private readonly blockchain: BlockchainService,
    private readonly enrollment: ChainEnrollmentService,
    private readonly kycAi: KycAiService,
  ) {}

  @Get('enrollment/ai-status')
  enrollmentAiStatus() {
    return this.kycAi.configured();
  }

  @Post('enrollment/validate-document')
  async validateDocument(
    @Body()
    body: {
      country?: string;
      documentType?: 'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE';
      documentNumber?: string;
    },
  ) {
    if (!body.documentType) {
      throw new BadRequestException('Document type is required');
    }
    if (!body.documentNumber?.trim()) {
      throw new BadRequestException('Document number is required');
    }
    const result = await this.kycAi.validateDocumentNumber({
      documentType: body.documentType,
      documentNumber: body.documentNumber,
      country: body.country,
    });
    if (!result.plausible) {
      throw new BadRequestException(
        result.reason ||
          'Document number does not look valid. Check and try again.',
      );
    }
    return result;
  }

  @Get('enrollment')
  getEnrollment(@Request() req: AuthedRequest) {
    return this.enrollment.getEnrollment(req.user.id);
  }

  @Post('enrollment/accept-terms')
  acceptTerms(@Request() req: AuthedRequest) {
    return this.enrollment.acceptTerms(req.user.id);
  }

  @Post('enrollment/cancel')
  cancelEnrollment(@Request() req: AuthedRequest) {
    return this.enrollment.cancelAndRestart(req.user.id);
  }

  @Post('enrollment/kyc')
  submitEnrollmentKyc(
    @Request() req: AuthedRequest,
    @Body()
    body: {
      country?: string;
      documentType?: 'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE';
      documentNumber?: string;
      documentFrontUrl?: string;
      documentBackUrl?: string;
      livenessSelfieUrl?: string;
    },
  ) {
    if (!body.country?.trim()) {
      throw new BadRequestException('Country is required');
    }
    if (!body.documentType) {
      throw new BadRequestException('Document type is required');
    }
    if (!body.documentNumber?.trim()) {
      throw new BadRequestException('Document number is required');
    }
    if (!body.documentFrontUrl?.trim()) {
      throw new BadRequestException('Document front image is required');
    }
    if (!body.livenessSelfieUrl?.trim()) {
      throw new BadRequestException('Liveness capture is required');
    }
    return this.enrollment.submitKyc(req.user.id, {
      country: body.country,
      documentType: body.documentType,
      documentNumber: body.documentNumber,
      documentFrontUrl: body.documentFrontUrl,
      documentBackUrl: body.documentBackUrl,
      livenessSelfieUrl: body.livenessSelfieUrl,
    });
  }

  @Post('enrollment/activate')
  activateEnrollment(
    @Request() req: AuthedRequest,
    @Body() body: { depositUsd?: number },
  ) {
    return this.enrollment.markActivated(
      req.user.id,
      Number(body.depositUsd) || 0,
    );
  }

  @Get('enrollment/vault')
  vaultStatus(@Request() req: AuthedRequest) {
    return this.enrollment.getVaultStatus(req.user.id);
  }

  @Post('enrollment/vault/fund')
  fundVault(@Request() req: AuthedRequest, @Body() body: { amount?: number }) {
    return this.enrollment.transferFromPlatformWallet(
      req.user.id,
      Number(body.amount) || 0,
    );
  }

  @Post('enrollment/vault/withdraw')
  withdrawVault(
    @Request() req: AuthedRequest,
    @Body() body: { amount?: number },
  ) {
    return this.enrollment.withdrawToPlatformWallet(
      req.user.id,
      body.amount == null ? undefined : Number(body.amount),
    );
  }

  @Get('enrollment/pending')
  @Roles(UserRole.ADMIN)
  pendingEnrollments(@Query('limit') limit?: string) {
    return this.enrollment.listPending(Number(limit) || 50);
  }

  @Post('enrollment/:userId/approve')
  @Roles(UserRole.ADMIN)
  approveEnrollment(@Param('userId') userId: string) {
    return this.enrollment.approve(userId);
  }

  @Post('enrollment/:userId/reject')
  @Roles(UserRole.ADMIN)
  rejectEnrollment(
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    return this.enrollment.reject(userId, body.reason ?? 'Rejected');
  }

  @Get('contract/status')
  contractStatus() {
    return this.blockchain.getContractInfo();
  }

  @Public()
  @Get('contract/config')
  contractConfig() {
    return this.blockchain.getPublicContractConfig();
  }

  @Get('contract/stats')
  contractStats() {
    return this.blockchain.getContractStats();
  }

  @Get('wallet')
  wallet() {
    return this.blockchain.getWallet();
  }

  @Post('wallet/connect')
  connect() {
    return this.blockchain.connectWallet();
  }

  @Post('wallet/disconnect')
  disconnect() {
    return this.blockchain.disconnectWallet();
  }

  @Get('transactions')
  transactions(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.blockchain.getTransactions().then((rows) => {
      let filtered = rows;
      if (q) {
        const needle = q.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.wallet.toLowerCase().includes(needle) ||
            r.hash.toLowerCase().includes(needle),
        );
      }
      if (type) filtered = filtered.filter((r) => r.type === type);
      if (status) filtered = filtered.filter((r) => r.status === status);
      const p = Math.max(1, Number(page) || 1);
      const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
      const start = (p - 1) * size;
      return {
        items: filtered.slice(start, start + size),
        total: filtered.length,
        page: p,
        pageSize: size,
      };
    });
  }

  @Get('events')
  events() {
    return this.blockchain.getEvents();
  }

  @Post('events/ingest')
  ingestEvent(
    @Body()
    body: {
      name: string;
      type: string;
      transactionHash: string;
      blockNumber: number;
      wallet: string;
      amount?: number;
      timestamp?: string;
    },
  ) {
    return this.blockchain.ingestEvent(body);
  }

  @Post('launch/subscribe')
  subscribeLaunch(
    @Request() req: AuthedRequest,
    @Body() body: { email?: string },
  ) {
    return this.blockchain.subscribeLaunch(body.email ?? '', req.user.id);
  }

  @Get('activity')
  activity() {
    return this.blockchain.getActivity();
  }

  @Get('statistics')
  statistics() {
    return this.blockchain.getStatistics();
  }

  @Get('investors')
  investors(
    @Query('q') q?: string,
    @Query('sort') sort = 'joinedAt',
    @Query('order') order: 'asc' | 'desc' = 'desc',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.blockchain.getInvestors().then((rows) => {
      let filtered = rows;
      if (q) {
        const needle = q.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.wallet.toLowerCase().includes(needle) ||
            r.country.toLowerCase().includes(needle),
        );
      }
      filtered = [...filtered].sort((a, b) => {
        const key = sort as keyof typeof a;
        const av = a[key];
        const bv = b[key];
        if (typeof av === 'number' && typeof bv === 'number') {
          return order === 'asc' ? av - bv : bv - av;
        }
        return order === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
      const p = Math.max(1, Number(page) || 1);
      const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
      const start = (p - 1) * size;
      return {
        items: filtered.slice(start, start + size),
        total: filtered.length,
        page: p,
        pageSize: size,
      };
    });
  }

  @Get('notifications')
  notifications() {
    return this.blockchain.getNotifications();
  }

  @Get('dashboard')
  dashboard(@Request() req: AuthedRequest) {
    const isAdmin = req.user.role === UserRole.ADMIN;
    return this.blockchain.getDashboard(isAdmin);
  }

  @Get('health')
  @Roles(UserRole.ADMIN)
  health() {
    return this.blockchain.getHealth();
  }

  @Get('admin')
  @Roles(UserRole.ADMIN)
  admin() {
    return this.blockchain.getAdminDashboard();
  }

  @Post('deposit')
  deposit(@Body() body: { amount?: number }) {
    return this.blockchain.deposit(Number(body.amount) || 0);
  }

  @Post('withdraw')
  withdraw(@Body() body: { amount?: number }) {
    return this.blockchain.withdraw(Number(body.amount) || 0);
  }

  @Post('claim')
  claim() {
    return this.blockchain.claim();
  }

  @Post('compound')
  compound() {
    return this.blockchain.compound();
  }

  @Post('sync')
  @Roles(UserRole.ADMIN)
  sync() {
    return this.blockchain.sync();
  }

  @Post('admin/pause')
  @Roles(UserRole.ADMIN)
  pause() {
    return this.blockchain.pauseContract();
  }

  @Post('admin/unpause')
  @Roles(UserRole.ADMIN)
  unpause() {
    return this.blockchain.unpauseContract();
  }

  @Post('admin/reward-rate')
  @Roles(UserRole.ADMIN)
  rewardRate(@Body() body: { rate?: number }) {
    return this.blockchain.updateRewardRate(Number(body.rate) || 0);
  }

  @Post('admin/treasury')
  @Roles(UserRole.ADMIN)
  treasury(@Body() body: { address?: string }) {
    return this.blockchain.updateTreasuryWallet(body.address ?? '');
  }

  @Post('admin/fee')
  @Roles(UserRole.ADMIN)
  fee(@Body() body: { feeBps?: number }) {
    return this.blockchain.updateFee(Number(body.feeBps) || 0);
  }

  @Post('admin/emergency-withdraw')
  @Roles(UserRole.ADMIN)
  emergency() {
    return this.blockchain.emergencyWithdraw();
  }

  @Post('admin/reindex')
  @Roles(UserRole.ADMIN)
  reindex() {
    return this.blockchain.reindexTransactions();
  }

  @Post('admin/reconnect-rpc')
  @Roles(UserRole.ADMIN)
  reconnect() {
    return this.blockchain.reconnectRpc();
  }
}
