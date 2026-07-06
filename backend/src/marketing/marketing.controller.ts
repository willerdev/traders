import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { MarketingTestEmailDto } from '../common/dto';

@Controller('admin/marketing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class MarketingController {
  constructor(private marketingService: MarketingService) {}

  @Get('schedule')
  getSchedule() {
    return this.marketingService.getSchedule();
  }

  @Get('history')
  getHistory(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.marketingService.getHistory(
      limit ? Number(limit) : 100,
      offset ? Number(offset) : 0,
    );
  }

  @Post('run')
  runNow() {
    return this.marketingService.runCampaign('manual');
  }

  @Post('test-email')
  sendTestEmail(@Body() dto: MarketingTestEmailDto) {
    return this.marketingService.sendTestEmail(
      dto.email?.trim() || 'willeratmit12@gmail.com',
    );
  }
}
