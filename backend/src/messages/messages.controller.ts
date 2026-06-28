import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { SendMessageDto } from '../common/dto';
import { JwtAuthGuard } from '../auth/guards';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private messages: MessagesService) {}

  @Get()
  getMyThread(@Request() req: { user: { id: string } }) {
    return this.messages.getTraderThread(req.user.id);
  }

  @Get('unread-count')
  getUnreadCount(@Request() req: { user: { id: string } }) {
    return this.messages.getTraderUnreadCount(req.user.id).then((count) => ({
      count,
    }));
  }

  @Post()
  sendMessage(
    @Request() req: { user: { id: string } },
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.sendTraderMessage(req.user.id, dto.body);
  }
}
