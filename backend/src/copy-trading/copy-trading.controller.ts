import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateCopySettingsDto } from '../common/dto';
import { CopyTradingService } from './copy-trading.service';

class AddCopyPoolTraderDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

@Controller('admin/hub/metaapi/copy-pool')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCopyPoolController {
  constructor(private copyTrading: CopyTradingService) {}

  @Post()
  addTrader(
    @Request() req: { user: { id: string } },
    @Body() dto: AddCopyPoolTraderDto,
  ) {
    return this.copyTrading.addPoolTrader(dto.userId.trim(), req.user.id);
  }

  @Delete(':userId')
  removeTrader(@Param('userId') userId: string) {
    return this.copyTrading.removePoolTrader(userId.trim());
  }
}

@Controller('admin/hub/metaapi/copy-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCopySettingsController {
  constructor(private copyTrading: CopyTradingService) {}

  @Get()
  getSettings() {
    return this.copyTrading.getCopySettings();
  }

  @Post()
  updateSettings(@Body() dto: UpdateCopySettingsDto) {
    return this.copyTrading.updateCopySettings(dto);
  }
}
