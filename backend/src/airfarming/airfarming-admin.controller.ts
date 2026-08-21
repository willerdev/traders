import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, AdminPermissionGuard } from '../auth/guards';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AirfarmingService } from './airfarming.service';

@Controller('admin/airfarming')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
@RequireAdminPermission('full')
export class AirfarmingAdminController {
  constructor(private airfarming: AirfarmingService) {}

  @Get('settings')
  getSettings() {
    return this.airfarming.adminGetSettings();
  }

  @Patch('settings')
  patchSettings(
    @Body()
    body: {
      maxPercent?: number;
      maxProfitPerDrop?: number;
      weeklyYieldFloorRate?: number;
      dropIntervalHours?: number[];
      eligibilitySnapshotHours?: number;
      floatPrepHours?: number;
      platformFeeRate?: number;
    },
  ) {
    return this.airfarming.adminPatchSettings(body);
  }

  @Patch('bands/:index')
  patchBand(
    @Param('index', ParseIntPipe) index: number,
    @Body()
    body: {
      label?: string;
      minBalance?: number;
      maxBalance?: number;
      percent?: number;
      active?: boolean;
    },
  ) {
    return this.airfarming.adminPatchBand(index, body);
  }

  @Post('global-pause')
  globalPause(@Body() body: { paused: boolean }) {
    return this.airfarming.adminSetGlobalPause(Boolean(body.paused));
  }

  @Get('members')
  members() {
    return this.airfarming.listActiveMembers(100);
  }

  @Get('applications')
  applications(@Query('status') status?: string) {
    const normalized =
      status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED'
        ? status
        : undefined;
    return this.airfarming.adminListApplications(normalized);
  }

  @Post('applications/:userId/approve')
  approveApplication(
    @Request() req: { user: { id: string } },
    @Param('userId') userId: string,
  ) {
    return this.airfarming.adminApproveApplication(userId, req.user.id);
  }

  @Post('applications/:userId/reject')
  rejectApplication(
    @Request() req: { user: { id: string } },
    @Param('userId') userId: string,
    @Body() body: { reason: string },
  ) {
    return this.airfarming.adminRejectApplication(userId, req.user.id, body.reason);
  }
}
