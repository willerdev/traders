import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { BlockchainService } from './blockchain.service';

type AuthedRequest = { user: { id: string; role: UserRole } };

/**
 * REST façade matching the planned contract surface.
 * Prefixed with /blockchain to avoid colliding with platform /wallet.
 *
 * Routes (all under /api/v1/blockchain):
 *   GET  /contract/status | /contract/stats
 *   GET  /wallet | /transactions | /events | /dashboard | /investors | /notifications | /health | /admin
 *   POST /deposit | /withdraw | /claim | /compound
 *   POST /wallet/connect | /wallet/disconnect | /sync | admin actions
 */
@Controller('blockchain')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlockchainController {
  constructor(private readonly blockchain: BlockchainService) {}

  @Get('contract/status')
  contractStatus() {
    return this.blockchain.getContractInfo();
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
