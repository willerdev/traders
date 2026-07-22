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
import { AccountTransferService } from './account-transfer.service';
import { JwtAuthGuard, AdminPermissionGuard } from '../auth/guards';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';

@Controller('admin/account-transfers')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
@RequireAdminPermission('full')
export class AccountTransferAdminController {
  constructor(private transfers: AccountTransferService) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.transfers.adminList(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
      status,
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.transfers.adminGet(id);
  }

  @Post()
  create(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      fromUserId?: string;
      fromEmail?: string;
      toUserId?: string;
      toEmail?: string;
      note?: string;
    },
  ) {
    return this.transfers.adminCreate(req.user.id, body);
  }

  @Post(':id/cancel')
  cancel(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.transfers.adminCancel(req.user.id, id);
  }

  @Post(':id/finalize')
  finalizeNow(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.transfers.finalize(id, {
      adminId: req.user.id,
      forced: true,
    });
  }
}
