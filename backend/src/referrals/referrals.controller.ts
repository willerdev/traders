import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateReferralSettingsDto } from '../common/dto';

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

  @Get()
  listReferrers() {
    return this.referralsService.listReferrersForAdmin();
  }
}
