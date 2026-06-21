import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SignalsService } from './signals.service';
import { SignalDraftsService } from './signal-drafts.service';
import { CreateSignalDto, SaveSignalDraftDto } from '../common/dto';
import { JwtAuthGuard } from '../auth/guards';

@Controller('signals')
@UseGuards(JwtAuthGuard)
export class SignalsController {
  constructor(
    private signalsService: SignalsService,
    private draftsService: SignalDraftsService,
  ) {}

  @Get('drafts')
  listDrafts(@Request() req: { user: { id: string } }) {
    return this.draftsService.list(req.user.id);
  }

  @Post('drafts')
  createDraft(
    @Request() req: { user: { id: string } },
    @Body() dto: SaveSignalDraftDto,
  ) {
    return this.draftsService.create(req.user.id, dto);
  }

  @Get('drafts/:draftId')
  getDraft(
    @Request() req: { user: { id: string } },
    @Param('draftId') draftId: string,
  ) {
    return this.draftsService.get(req.user.id, draftId);
  }

  @Put('drafts/:draftId')
  updateDraft(
    @Request() req: { user: { id: string } },
    @Param('draftId') draftId: string,
    @Body() dto: SaveSignalDraftDto,
  ) {
    return this.draftsService.update(req.user.id, draftId, dto);
  }

  @Delete('drafts/:draftId')
  deleteDraft(
    @Request() req: { user: { id: string } },
    @Param('draftId') draftId: string,
  ) {
    return this.draftsService.delete(req.user.id, draftId);
  }

  @Post()
  submit(@Request() req: { user: { id: string } }, @Body() dto: CreateSignalDto) {
    return this.signalsService.submit(req.user.id, dto);
  }

  @Get()
  getMySignals(@Request() req: { user: { id: string } }) {
    return this.signalsService.getUserSignals(req.user.id);
  }

  @Get(':signalId')
  getSignal(@Param('signalId') signalId: string) {
    return this.signalsService.getSignal(signalId);
  }
}
