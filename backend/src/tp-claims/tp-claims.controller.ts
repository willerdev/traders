import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { TpClaimsService } from './tp-claims.service';
import { ResubmitTpClaimDto } from '../common/dto';
import { JwtAuthGuard } from '../auth/guards';

@Controller('tp-claims')
@UseGuards(JwtAuthGuard)
export class TpClaimsController {
  constructor(private tpClaimsService: TpClaimsService) {}

  @Get()
  listMine(@Request() req: { user: { id: string } }) {
    return this.tpClaimsService.listUserClaims(req.user.id);
  }

  @Post(':claimId/resubmit')
  resubmit(
    @Request() req: { user: { id: string } },
    @Param('claimId') claimId: string,
    @Body() dto: ResubmitTpClaimDto,
  ) {
    return this.tpClaimsService.resubmitClaim(
      claimId,
      req.user.id,
      dto.beforeScreenshotUrl,
      dto.afterScreenshotUrl,
    );
  }
}
