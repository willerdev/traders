import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
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
  @UseGuards(AuthRateLimitGuard)
  saveToken(
    @Request() req: { user: { id: string } },
    @Body() dto: SaveMetaApiTokenDto,
  ) {
    return this.mt5.saveCloudToken(req.user.id, dto.token);
  }

  @Delete('token')
  disconnect(@Request() req: { user: { id: string } }) {
    return this.mt5.disconnectCloudToken(req.user.id);
  }

  @Get('accounts')
  accounts(@Request() req: { user: { id: string } }) {
    return this.mt5.listCloudAccounts(req.user.id);
  }

  @Put('account')
  @UseGuards(AuthRateLimitGuard)
  linkAccount(
    @Request() req: { user: { id: string } },
    @Body() dto: LinkMetaApiAccountDto,
  ) {
    return this.mt5.linkCloudAccount(req.user.id, dto.accountId, dto.token);
  }
}
