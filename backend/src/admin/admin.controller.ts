import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreatePromoCodeDto } from '../common/dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
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
    @Body('reason') reason: string,
  ) {
    return this.adminService.rejectKyc(userId, req.user.id, reason || 'Rejected');
  }

  @Get('users')
  listUsers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listUsers(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
  }

  @Get('signals')
  listSignals(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listSignals(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
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

  @Post('payouts/:payoutId/approve')
  approvePayout(
    @Param('payoutId') payoutId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.adminService.approvePayout(payoutId, req.user.id);
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
}
