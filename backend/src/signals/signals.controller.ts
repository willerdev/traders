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
  UpdateSetupStopsDto,
  InvalidateSetupDto,
  PartialCloseSetupDto,
  TradeOutcomeWebhookDto,
  TradeLifecycleWebhookDto,
  HubActionDto,
} from '../common/dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';

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
    @Query('key') key: string | undefined,
    @Body() dto: TradeOutcomeWebhookDto,
  ) {
    this.signalsService.verifyWebhookSecret(secret || key);
    return this.signalsService.handleTradeOutcomeWebhook(dto);
  }

  @Post('webhook/trades')
  tradeLifecycleWebhook(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Query('key') key: string | undefined,
    @Body() dto: TradeLifecycleWebhookDto,
  ) {
    this.signalsService.verifyWebhookSecret(secret || key);
    return this.signalsService.handleTradeLifecycleWebhook(dto);
  }

  @Get('hub/health')
  @UseGuards(JwtAuthGuard)
  hubHealth() {
    return this.signalsService.getHubHealth();
  }

  @Get('execution/warmup')
  @UseGuards(JwtAuthGuard)
  warmupExecution(@Request() req: { user: { id: string } }) {
    return this.signalsService.warmupExecution(req.user.id);
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

  @Get('hub/quote')
  @UseGuards(JwtAuthGuard)
  hubQuote(
    @Request() req: { user: { id: string } },
    @Query('symbol') symbol: string,
  ) {
    return this.signalsService.getHubQuote(req.user.id, symbol);
  }

  @Get('hub/signals/:hubId')
  @UseGuards(JwtAuthGuard)
  hubSignalById(
    @Request() req: { user: { id: string } },
    @Param('hubId') hubId: string,
  ) {
    return this.signalsService.getHubSignalById(req.user.id, hubId);
  }

  @Post('hub/action')
  @UseGuards(JwtAuthGuard)
  hubAction(
    @Request() req: { user: { id: string } },
    @Body() dto: HubActionDto,
  ) {
    return this.signalsService.sendHubAction(req.user.id, dto);
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

  @Get('setup-quota')
  @UseGuards(JwtAuthGuard)
  getSetupQuota(@Request() req: { user: { id: string } }) {
    return this.signalsService.getSetupQuota(req.user.id);
  }

  @Get('open/unresolved')
  @UseGuards(JwtAuthGuard)
  listOpenSetups(@Request() req: { user: { id: string } }) {
    return this.signalsService.getOpenSignalsWithResolution(req.user.id);
  }

  @Get('claimable/tps')
  @UseGuards(JwtAuthGuard)
  listClaimableTps(@Request() req: { user: { id: string } }) {
    return this.signalsService.listClaimableTpSetups(req.user.id);
  }

  @Post('invalidate/:signalId')
  @UseGuards(JwtAuthGuard)
  invalidateSetup(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
    @Body() dto: InvalidateSetupDto,
  ) {
    return this.signalsService.invalidateSetup(
      req.user.id,
      signalId,
      dto.reason,
    );
  }

  @Post(':signalId/delete-limit')
  @UseGuards(JwtAuthGuard)
  deleteSetupLimit(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.deleteSetupLimit(req.user.id, signalId);
  }

  @Post('archive/:signalId')
  @UseGuards(JwtAuthGuard)
  archiveSetup(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.archiveSetup(req.user.id, signalId);
  }

  @Post('archive-all')
  @UseGuards(JwtAuthGuard)
  archiveAllSetups(@Request() req: { user: { id: string } }) {
    return this.signalsService.archiveAllSetups(req.user.id);
  }

  @Get('archived/list')
  @UseGuards(JwtAuthGuard)
  listArchivedSetups(
    @Request() req: { user: { id: string } },
    @Query('limit') limit?: string,
  ) {
    return this.signalsService.listArchivedSetups(
      req.user.id,
      limit ? Number(limit) : 50,
    );
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

  @Get('mt5/quotes')
  @UseGuards(JwtAuthGuard)
  getUserMt5Quotes(@Request() req: { user: { id: string } }) {
    return this.signalsService.getUserMt5Quotes(req.user.id);
  }

  @Get('mt5/quote')
  @UseGuards(JwtAuthGuard)
  getUserMt5Quote(
    @Request() req: { user: { id: string } },
    @Query('symbol') symbol: string,
  ) {
    return this.signalsService.getUserMt5Quote(req.user.id, symbol);
  }

  @Get('mt5/ohlc')
  @UseGuards(JwtAuthGuard)
  getUserMt5Ohlc(
    @Request() req: { user: { id: string } },
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.signalsService.getUserMt5Ohlc(
      req.user.id,
      symbol,
      timeframe,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Get('mt5/running')
  @UseGuards(JwtAuthGuard)
  getUserMt5Running(@Request() req: { user: { id: string } }) {
    return this.signalsService.getUserMt5RunningTrades(req.user.id);
  }

  @Get('mt5/terminal')
  @UseGuards(JwtAuthGuard)
  getUserMt5Terminal(@Request() req: { user: { id: string } }) {
    return this.signalsService.getUserMt5Terminal(req.user.id);
  }

  @Post('mt5/positions/close-all')
  @UseGuards(JwtAuthGuard)
  closeAllUserMt5Positions(@Request() req: { user: { id: string } }) {
    return this.signalsService.closeAllUserMt5Positions(req.user.id);
  }

  @Post('mt5/positions/:positionId/close')
  @UseGuards(JwtAuthGuard)
  closeUserMt5Position(
    @Request() req: { user: { id: string } },
    @Param('positionId') positionId: string,
  ) {
    return this.signalsService.closeUserMetaApiPosition(
      req.user.id,
      positionId,
    );
  }

  @Get('metaapi/accounts')
  @UseGuards(JwtAuthGuard)
  listMetaApiAccounts(@Request() req: { user: { id: string } }) {
    return this.signalsService.listMetaApiAccountsForUser(req.user.id);
  }

  @Get('metaapi/copy-dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getCopyTradingDashboard() {
    return this.signalsService.getCopyTradingDashboard();
  }

  @Post(':signalId/place-trade')
  @UseGuards(JwtAuthGuard)
  placeTrade(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.placeTrade(req.user.id, signalId);
  }

  @Post(':signalId/close-trade')
  @UseGuards(JwtAuthGuard)
  closeSetupTrade(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.closeSetupTrade(req.user.id, signalId);
  }

  @Post(':signalId/set-breakeven')
  @UseGuards(JwtAuthGuard)
  setBreakeven(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.setBreakeven(req.user.id, signalId);
  }

  @Post(':signalId/partial-close')
  @UseGuards(JwtAuthGuard)
  partialCloseSetupTrade(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
    @Body() dto: PartialCloseSetupDto,
  ) {
    return this.signalsService.partialCloseSetupTrade(
      req.user.id,
      signalId,
      dto.volume,
    );
  }

  @Post(':signalId/update-stops')
  @UseGuards(JwtAuthGuard)
  updateSetupStops(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
    @Body() dto: UpdateSetupStopsDto,
  ) {
    return this.signalsService.updateSetupStops(req.user.id, signalId, dto);
  }

  @Get(':signalId/live-trade')
  @UseGuards(JwtAuthGuard)
  getSetupLiveTrade(
    @Request() req: { user: { id: string } },
    @Param('signalId') signalId: string,
  ) {
    return this.signalsService.getSetupLiveTrade(req.user.id, signalId);
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
