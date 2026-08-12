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
import { JwtAuthGuard } from '../auth/guards';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get()
  listInbox(@Request() req: { user: { id: string } }) {
    return this.chat.listInbox(req.user.id);
  }

  @Get('unread-count')
  getUnreadCount(@Request() req: { user: { id: string } }) {
    return this.chat.unreadCount(req.user.id).then((count) => ({ count }));
  }

  @Post('start')
  startByEmail(
    @Request() req: { user: { id: string } },
    @Body() body: { email?: string },
  ) {
    return this.chat.startByEmail(req.user.id, body.email ?? '');
  }

  @Get(':id/messages')
  getMessages(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('since') since?: string,
  ) {
    return this.chat.getMessages(req.user.id, id, since);
  }

  @Post(':id/messages')
  sendMessage(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: { body?: string },
  ) {
    return this.chat.sendMessage(req.user.id, id, body.body ?? '');
  }
}
