import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { ProductAgentService } from './product-agent.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { MarketingTestEmailDto } from '../common/dto';

@Controller('admin/marketing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class MarketingController {
  constructor(
    private marketingService: MarketingService,
    private productAgent: ProductAgentService,
  ) {}

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

  // ─── Product adoption agent ────────────────────────────────────────────

  @Get('product-agent/overview')
  productAgentOverview() {
    return this.productAgent.getOverview();
  }

  @Get('product-agent/products')
  productAgentProducts() {
    return this.productAgent.listProducts();
  }

  @Post('product-agent/products')
  createProduct(
    @Body()
    body: {
      slug: string;
      name: string;
      description: string;
      cadence?: string;
      yieldLabel?: string;
      ctaPath?: string;
      detectKey?: string;
    },
  ) {
    return this.productAgent.createProduct(body);
  }

  @Get('product-agent/plans')
  productAgentPlans(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.productAgent.listPlans({
      status,
      limit: limit ? Number(limit) : 100,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('product-agent/profiles')
  productAgentProfiles(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.productAgent.listProfiles(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
  }

  @Get('product-agent/profiles/:userId')
  productAgentProfile(@Param('userId') userId: string) {
    return this.productAgent.getProfile(userId);
  }

  @Post('product-agent/rebuild-profiles')
  rebuildProfiles(@Body() body?: { limit?: number }) {
    return this.productAgent.rebuildAllProfiles(body?.limit);
  }

  @Post('product-agent/sync-enrollments')
  syncEnrollments() {
    return this.productAgent.syncAllEnrollments();
  }

  @Post('product-agent/plan-week')
  planWeek(@Body() body?: { force?: boolean; skipSync?: boolean }) {
    return this.productAgent.planWeek('manual', {
      force: Boolean(body?.force),
      skipSync: body?.skipSync !== false,
    });
  }

  @Post('product-agent/send-due')
  sendDue() {
    return this.productAgent.sendDuePlans('manual');
  }
}
