import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FeedsService } from './feeds.service';
import { FeedsApiKeyGuard } from './feeds-api-key.guard';
import { ListSetupFeedQueryDto } from '../common/dto';

@Controller('feeds')
@UseGuards(FeedsApiKeyGuard)
export class FeedsController {
  constructor(private readonly feedsService: FeedsService) {}

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
}
