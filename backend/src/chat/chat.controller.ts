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

  @Get('unread-count')
  getUnreadCount(@Request() req: { user: { id: string } }) {
    return this.chat.unreadCount(req.user.id).then((count) => ({ count }));
  }

  @Get('conversations')
  listInbox(@Request() req: { user: { id: string } }) {
    return this.chat.listInbox(req.user.id);
  }

  /** @deprecated Prefer GET /chat/conversations */
  @Get()
  listInboxAlias(@Request() req: { user: { id: string } }) {
    return this.chat.listInbox(req.user.id);
  }

  @Post('conversations')
  startConversation(
    @Request() req: { user: { id: string } },
    @Body() body: { recipientEmail?: string; email?: string; body?: string },
  ) {
    return this.chat.startConversation(
      req.user.id,
      body.recipientEmail ?? body.email ?? '',
      body.body,
    );
  }

  /** @deprecated Prefer POST /chat/conversations */
  @Post('start')
  startByEmail(
    @Request() req: { user: { id: string } },
    @Body() body: { email?: string; recipientEmail?: string; body?: string },
  ) {
    return this.chat.startConversation(
      req.user.id,
      body.recipientEmail ?? body.email ?? '',
      body.body,
    );
  }

  @Get('conversations/:id')
  getConversation(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.chat.getConversation(req.user.id, id);
  }

  @Get('conversations/:id/messages')
  getMessages(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('since') since?: string,
  ) {
    return this.chat.getMessages(req.user.id, id, since);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: { body?: string },
  ) {
    return this.chat.sendMessage(req.user.id, id, body.body ?? '');
  }

  @Post('conversations/:id/read')
  markRead(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.chat.markRead(req.user.id, id);
  }

  /** @deprecated Prefer /chat/conversations/:id/messages */
  @Get(':id/messages')
  getMessagesAlias(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('since') since?: string,
  ) {
    return this.chat.getMessages(req.user.id, id, since);
  }

  /** @deprecated Prefer /chat/conversations/:id/messages */
  @Post(':id/messages')
  sendMessageAlias(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: { body?: string },
  ) {
    return this.chat.sendMessage(req.user.id, id, body.body ?? '');
  }
}
