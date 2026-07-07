import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { PresenceService } from './presence.service';

@Controller('presence')
export class PresenceController {
  constructor(private presence: PresenceService) {}

  @Post('heartbeat')
  @UseGuards(JwtAuthGuard)
  heartbeat(
    @Request() req: { user: { id: string } },
    @Body() body: { path?: string },
  ) {
    return this.presence.recordHeartbeat(
      req.user.id,
      typeof body?.path === 'string' ? body.path : '/',
    );
  }
}
