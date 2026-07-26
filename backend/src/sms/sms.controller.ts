import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { SmsService } from './sms.service';

@Controller('admin/sms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SmsController {
  constructor(private sms: SmsService) {}

  @Get('status')
  status() {
    return this.sms.getStatus();
  }

  @Get('numbers')
  numbers() {
    return this.sms.listIncomingNumbers();
  }

  @Post('test')
  sendTest(
    @Body()
    body: {
      to?: string;
      body?: string;
      from?: string;
      channel?: 'sms' | 'whatsapp';
      contentSid?: string;
      contentVariables?: Record<string, string>;
    },
  ) {
    return this.sms.sendTestSms({
      to: body.to ?? '',
      body: body.body,
      from: body.from,
      channel: body.channel,
      contentSid: body.contentSid,
      contentVariables: body.contentVariables,
    });
  }
}
