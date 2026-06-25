import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  Headers,
} from '@nestjs/common';
import { SignalsService } from './signals.service';
import { SignalDraftsService } from './signal-drafts.service';
import {
  CreateSignalDto,
  SaveSignalDraftDto,
  ClaimSetupDto,
  TradeOutcomeWebhookDto,
} from '../common/dto';
import { JwtAuthGuard } from '../auth/guards';

@Controller('signals')
export class SignalsController {
  constructor(
    private signalsService: SignalsService,
    private draftsService: SignalDraftsService,
  ) {}

  @Post('hub/callback')
  hubCallback(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Query('key') key: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    this.signalsService.verifyWebhookSecret(secret || key);
    return this.signalsService.handleHubCallback(payload);
  }

  @Post('webhook/outcome')
  tradeOutcomeWebhook(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body() dto: TradeOutcomeWebhookDto,
  ) {
    this.signalsService.verifyWebhookSecret(secret);
    return this.signalsService.handleTradeOutcomeWebhook(dto);
  }

  @Get('hub/health')
  @UseGuards(JwtAuthGuard)
  hubHealth() {
    return this.signalsService.getHubHealth();
  }

  @Get('hub/positions')
  @UseGuards(JwtAuthGuard)
  hubPositions(@Request() req: { user: { id: string } }) {
    return this.signalsService.getOpenPositions(req.user.id);
  }

  @Get('hub/logs')
  @UseGuards(JwtAuthGuard)
  hubLogs(
    @Request() req: { user: { id: string } },
    @Query('signal_id') signalId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.signalsService.getExecutionLogs(req.user.id, {
      signal_id: signalId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('hub/list')
  @UseGuards(JwtAuthGuard)
  hubList(
    @Request() req: { user: { id: string } },
    @Query('status') status?: string,
    @Query('external_id') externalId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('since') since?: string,
  ) {
    return this.signalsService.listHubSignals(req.user.id, {
      status,
      external_id: externalId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      since,
    });
  }

  @Get('hub/execution/:signalId')
  @UseGuards(JwtAuthGuard)
  hubExecutionStatus(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.getExecutionStatus(req.user.id, signalId);
  }

  @Post('hub/resend/:signalId')
  @UseGuards(JwtAuthGuard)
  resendHub(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.resendToHub(req.user.id, signalId);
  }

  @Post('hub/positions/close-all')
  @UseGuards(JwtAuthGuard)
  hubCloseAll(@Request() req: { user: { id: string } }) {
    return this.signalsService.closeAllPositions(req.user.id);
  }

  @Post('hub/positions/:ticket/close')
  @UseGuards(JwtAuthGuard)
  hubCloseOne(
    @Request() req: { user: { id: string } },
    @Param('ticket', ParseIntPipe) ticket: number,
  ) {
    return this.signalsService.closePosition(req.user.id, ticket);
  }

  @Get('drafts')
  @UseGuards(JwtAuthGuard)
  listDrafts(@Request() req: { user: { id: string } }) {
    return this.draftsService.list(req.user.id);
  }

  @Post('drafts')
  @UseGuards(JwtAuthGuard)
  createDraft(
    @Request() req: { user: { id: string } },
    @Body() dto: SaveSignalDraftDto,
  ) {
    return this.draftsService.create(req.user.id, dto);
  }

  @Get('drafts/:draftId')
  @UseGuards(JwtAuthGuard)
  getDraft(
    @Request() req: { user: { id: string } },
    @Param('draftId') draftId: string,
  ) {
    return this.draftsService.get(req.user.id, draftId);
  }

  @Put('drafts/:draftId')
  @UseGuards(JwtAuthGuard)
  updateDraft(
    @Request() req: { user: { id: string } },
    @Param('draftId') draftId: string,
    @Body() dto: SaveSignalDraftDto,
  ) {
    return this.draftsService.update(req.user.id, draftId, dto);
  }

  @Delete('drafts/:draftId')
  @UseGuards(JwtAuthGuard)
  deleteDraft(
    @Request() req: { user: { id: string } },
    @Param('draftId') draftId: string,
  ) {
    return this.draftsService.delete(req.user.id, draftId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  submit(@Request() req: { user: { id: string } }, @Body() dto: CreateSignalDto) {
    return this.signalsService.submit(req.user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getMySignals(@Request() req: { user: { id: string } }) {
    return this.signalsService.getUserSignals(req.user.id);
  }

  @Get('open/unresolved')
  @UseGuards(JwtAuthGuard)
  listOpenSetups(@Request() req: { user: { id: string } }) {
    return this.signalsService.getOpenSignalsWithResolution(req.user.id);
  }

  @Post('archive/:signalId')
  @UseGuards(JwtAuthGuard)
  archiveSetup(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.archiveSetup(req.user.id, signalId);
  }

  @Post('claim/:signalId')
  @UseGuards(JwtAuthGuard)
  claimSetup(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
    @Body() dto: ClaimSetupDto,
  ) {
    return this.signalsService.claimSetup(req.user.id, signalId, dto);
  }

  @Get(':signalId/resolution')
  @UseGuards(JwtAuthGuard)
  getSetupResolution(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.getSetupResolution(req.user.id, signalId);
  }

  @Get(':signalId')
  @UseGuards(JwtAuthGuard)
  getSignal(
    @Request() req: { user: { id: string; role: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.getSignal(
      signalId,
      req.user.id,
      req.user.role,
    );
  }
}
