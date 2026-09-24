import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, SoloTradingAdminGuard } from '../auth/guards';
import {
  ModifyMt5PositionStopsDto,
  PartialCloseMt5PositionDto,
  PlaceMt5MarketOrderDto,
} from '../common/dto';
import { SoloMt5Service } from './solo-mt5.service';

@Controller('signals')
@UseGuards(JwtAuthGuard)
export class SoloMt5Controller {
  constructor(private mt5: SoloMt5Service) {}

  @Get('mt5/quotes/batch')
  getBatchQuotes(
    @Request() req: { user: { id: string } },
    @Query('symbols') symbols: string,
  ) {
    const list = symbols
      ? symbols
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    return this.mt5.batchQuotes(req.user.id, list);
  }

  @Get('mt5/quotes')
  getQuotes(@Request() req: { user: { id: string } }) {
    return this.mt5.quotes(req.user.id);
  }

  @Get('mt5/quote')
  getQuote(
    @Request() req: { user: { id: string } },
    @Query('symbol') symbol: string,
  ) {
    return this.mt5.quote(req.user.id, symbol);
  }

  @Get('mt5/ohlc')
  getOhlc(
    @Request() req: { user: { id: string } },
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.mt5.ohlc(
      req.user.id,
      symbol,
      timeframe,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Get('mt5/running')
  getRunning(@Request() req: { user: { id: string } }) {
    return this.mt5.running(req.user.id);
  }

  @Get('mt5/history')
  getHistory(
    @Request() req: { user: { id: string } },
    @Query('fresh') fresh?: string,
    @Query('days') days?: string,
  ) {
    const parsed = days ? Number.parseInt(days, 10) : 1;
    return this.mt5.history(
      req.user.id,
      fresh === '1' || fresh === 'true',
      Number.isFinite(parsed) ? parsed : 2,
    );
  }

  @Get('mt5/terminal')
  getTerminal(@Request() req: { user: { id: string } }) {
    return this.mt5.terminal(req.user.id);
  }

  @Get('mt5/order-preview')
  @UseGuards(SoloTradingAdminGuard)
  preview(
    @Request() req: { user: { id: string } },
    @Query('symbol') symbol: string,
    @Query('direction') direction: string,
    @Query('volume') volume?: string,
  ) {
    const parsedVolume =
      volume != null && volume.trim() !== '' ? Number(volume) : undefined;
    return this.mt5.previewOrder(
      req.user.id,
      symbol,
      direction,
      Number.isFinite(parsedVolume) ? parsedVolume : undefined,
    );
  }

  @Post('mt5/orders')
  @UseGuards(SoloTradingAdminGuard)
  place(
    @Request() req: { user: { id: string } },
    @Body() dto: PlaceMt5MarketOrderDto,
  ) {
    return this.mt5.placeOrder(req.user.id, dto);
  }

  @Post('mt5/positions/close-all')
  @UseGuards(SoloTradingAdminGuard)
  closeAll(@Request() req: { user: { id: string } }) {
    return this.mt5.closeAll(req.user.id);
  }

  @Post('mt5/positions/:positionId/close')
  @UseGuards(SoloTradingAdminGuard)
  close(
    @Request() req: { user: { id: string } },
    @Param('positionId') positionId: string,
  ) {
    return this.mt5.closePosition(req.user.id, positionId);
  }

  @Post('mt5/positions/:positionId/partial-close')
  @UseGuards(SoloTradingAdminGuard)
  partialClose(
    @Request() req: { user: { id: string } },
    @Param('positionId') positionId: string,
    @Body() dto: PartialCloseMt5PositionDto,
  ) {
    return this.mt5.partialClose(req.user.id, positionId, dto);
  }

  @Post('mt5/positions/:positionId/breakeven')
  @UseGuards(SoloTradingAdminGuard)
  setBreakeven(
    @Request() req: { user: { id: string } },
    @Param('positionId') positionId: string,
  ) {
    return this.mt5.setBreakeven(req.user.id, positionId);
  }

  @Post('mt5/positions/:positionId/modify-stops')
  @UseGuards(SoloTradingAdminGuard)
  modifyStops(
    @Request() req: { user: { id: string } },
    @Param('positionId') positionId: string,
    @Body() dto: ModifyMt5PositionStopsDto,
  ) {
    return this.mt5.modifyStops(req.user.id, positionId, dto);
  }
}
