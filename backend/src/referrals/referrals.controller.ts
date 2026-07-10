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
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  SettleReferralDto,
  UpdateReferralSettingsDto,
} from '../common/dto';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private referralsService: ReferralsService) {}

  @Get('me')
  getMine(@Request() req: { user: { id: string } }) {
    return this.referralsService.getMyReferralInfo(req.user.id);
  }
}

@Controller('admin/referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminReferralsController {
  constructor(private referralsService: ReferralsService) {}

  @Get('settings')
  getSettings() {
    return this.referralsService.getAdminSettings();
  }

  @Post('settings')
  updateSettings(@Body() dto: UpdateReferralSettingsDto) {
    return this.referralsService.updateAdminSettings(dto);
  }

  @Get('settlements')
  listSettlements(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 100;
    return this.referralsService.listSettlements(
      Number.isFinite(n) ? Math.min(Math.max(n, 1), 500) : 100,
    );
  }

  @Get()
  listReferrers() {
    return this.referralsService.listReferrersForAdmin();
  }

  @Post(':userId/settle')
  settle(
    @Param('userId') userId: string,
    @Body() dto: SettleReferralDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.referralsService.settleReferrer(
      userId,
      req.user.id,
      dto.note,
    );
  }
}
