import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, SoloTradingAdminGuard } from '../auth/guards';
import { AuthRateLimitGuard } from '../auth/auth-rate-limit.guard';
import { LinkMetaApiAccountDto, SaveMetaApiTokenDto } from './solo-mt5.dto';
import { SoloMt5Service } from './solo-mt5.service';

@Controller('metaapi')
@UseGuards(JwtAuthGuard)
export class MetaApiCloudController {
  constructor(private mt5: SoloMt5Service) {}

  @Get('status')
  status(@Request() req: { user: { id: string } }) {
    return this.mt5.cloudStatus(req.user.id);
  }

  @Put('token')
  @UseGuards(AuthRateLimitGuard, SoloTradingAdminGuard)
  saveToken(
    @Request() req: { user: { id: string } },
    @Body() dto: SaveMetaApiTokenDto,
  ) {
    return this.mt5.saveCloudToken(req.user.id, dto.token);
  }

  @Delete('token')
  @UseGuards(SoloTradingAdminGuard)
  disconnect(@Request() req: { user: { id: string } }) {
    return this.mt5.disconnectCloudToken(req.user.id);
  }

  @Get('accounts')
  accounts(@Request() req: { user: { id: string } }) {
    return this.mt5.listCloudAccounts(req.user.id);
  }

  @Put('account')
  @UseGuards(AuthRateLimitGuard, SoloTradingAdminGuard)
  linkAccount(
    @Request() req: { user: { id: string } },
    @Body() dto: LinkMetaApiAccountDto,
  ) {
    return this.mt5.linkCloudAccount(req.user.id, dto.accountId, dto.token);
  }

  @Get('viewer-assignments')
  listViewerAssignments(
    @Request() req: { user: { email?: string | null } },
  ) {
    return this.mt5.listViewerAccountAssignments(req.user.email);
  }

  @Patch('viewers/:userId/account')
  assignViewerAccount(
    @Request() req: { user: { email?: string | null } },
    @Param('userId') userId: string,
    @Body() body: { accountId?: string | null },
  ) {
    return this.mt5.assignViewerAccount(
      req.user.email,
      userId,
      body.accountId,
    );
  }
}
