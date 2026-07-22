import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AccountTransferService } from './account-transfer.service';

@Controller('account-transfers')
export class AccountTransferPublicController {
  constructor(private transfers: AccountTransferService) {}

  @Get('by-token')
  getByToken(@Query('token') token: string) {
    return this.transfers.getByToken(token ?? '');
  }

  @Post('agree')
  agree(@Body() body: { token: string }) {
    return this.transfers.userAgree(body.token ?? '');
  }
}
