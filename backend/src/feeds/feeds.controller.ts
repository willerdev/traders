import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FeedsService } from './feeds.service';
import { FeedsApiKeyGuard } from './feeds-api-key.guard';
import { ListSetupFeedQueryDto, IngestExternalSignalDto } from '../common/dto';
import { SignalsService } from '../signals/signals.service';

@Controller('feeds')
@UseGuards(FeedsApiKeyGuard)
export class FeedsController {
  constructor(
    private readonly feedsService: FeedsService,
    private readonly signalsService: SignalsService,
  ) {}

  /**
   * List trader-submitted setups for third-party consumers.
   * Each item includes pair/symbol, entry zone, stop loss, and take profit.
   */
  @Get('setups')
  listSetups(@Query() query: ListSetupFeedQueryDto) {
    return this.feedsService.listSetups({
      status: query.status,
      symbol: query.symbol,
      since: query.since,
      limit: query.limit,
    });
  }

  @Get('setups/:signalId')
  getSetup(@Param('signalId') signalId: string) {
    return this.feedsService.getSetup(signalId);
  }

  /**
   * Ingest a trading signal from a third-party system.
   * Creates an OPEN setup with pair, entry, SL, TP, and comment.
   */
  @Post('signals')
  ingestSignal(@Body() body: IngestExternalSignalDto) {
    return this.signalsService.ingestExternalSignal(body);
  }
}
