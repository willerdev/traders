import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { TpClaimsService } from './tp-claims.service';
import { JwtAuthGuard } from '../auth/guards';

@Controller('tp-claims')
@UseGuards(JwtAuthGuard)
export class TpClaimsController {
  constructor(private tpClaimsService: TpClaimsService) {}

  @Get()
  listMine(@Request() req: { user: { id: string } }) {
    return this.tpClaimsService.listUserClaims(req.user.id);
  }
}
