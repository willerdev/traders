import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { Mt5SyncService } from './mt5-sync.service';
import { Mt5PoolService } from './mt5-pool.service';
import { PrismaService } from '../prisma/prisma.service';

class SetMt5SyncEnabledDto {
  @IsBoolean()
  enabled: boolean;
}

class UpdateMt5SyncFeeDto {
  @IsNumber()
  feeUsdt: number;
}

class DeactivateMt5SyncUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

@Controller('mt5-sync')
@UseGuards(JwtAuthGuard)
export class Mt5SyncController {
  constructor(
    private sync: Mt5SyncService,
    private pool: Mt5PoolService,
  ) {}

  @Get('status')
  getStatus(@Request() req: { user: { id: string } }) {
    return this.sync.getStatus(req.user.id);
  }

  @Get('pool-accounts')
  listPoolAccounts(@Request() req: { user: { id: string } }) {
    return this.pool.listLinkableAccounts(req.user.id);
  }

  @Post('claim-account')
  claimAccount(@Request() req: { user: { id: string } }) {
    return this.pool.claimAccount(req.user.id);
  }

  @Post('enabled')
  setEnabled(
    @Request() req: { user: { id: string } },
    @Body() dto: SetMt5SyncEnabledDto,
  ) {
    return this.sync.setEnabled(req.user.id, dto.enabled);
  }
}

@Controller('admin/mt5-sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminMt5SyncController {
  constructor(
    private sync: Mt5SyncService,
    private prisma: PrismaService,
  ) {}

  @Get()
  overview() {
    return this.sync.getAdminOverview();
  }

  @Post('fee')
  updateFee(@Body() dto: UpdateMt5SyncFeeDto) {
    return this.sync.updateAdminFee(dto.feeUsdt);
  }

  @Post('deactivate')
  async deactivateUser(@Body() dto: DeactivateMt5SyncUserDto) {
    await this.prisma.user.update({
      where: { id: dto.userId.trim() },
      data: { mt5SyncActive: false },
    });
    return { ok: true, userId: dto.userId.trim() };
  }
}
