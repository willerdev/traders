import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { Mt5AssistantChatDto } from './dto/mt5-assistant-chat.dto';
import { Mt5AssistantService } from './mt5-assistant.service';

@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private mt5Assistant: Mt5AssistantService) {}

  @Post('mt5/chat')
  mt5Chat(
    @Request() req: { user: { id: string } },
    @Body() dto: Mt5AssistantChatDto,
  ) {
    return this.mt5Assistant.chat(
      req.user.id,
      dto.message,
      dto.history ?? [],
    );
  }
}
