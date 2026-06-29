import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PlatformNotificationsService } from './platform-notifications.service';
import { JwtAuthGuard } from '../auth/guards';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class PlatformNotificationsController {
  constructor(private notifications: PlatformNotificationsService) {}

  @Get()
  list(
    @Request() req: { user: { id: string } },
    @Query('limit') limit?: string,
  ) {
    return this.notifications.listForUser(
      req.user.id,
      limit ? Number(limit) : 30,
    );
  }

  @Patch('read-all')
  markAllRead(@Request() req: { user: { id: string } }) {
    return this.notifications.markAllRead(req.user.id);
  }

  @Patch(':id/read')
  markRead(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(req.user.id, id);
  }
}
