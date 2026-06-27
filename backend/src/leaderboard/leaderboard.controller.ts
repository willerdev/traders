import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards';
import { currentWeekYear } from '../common/week.util';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  @Get()
  getLeaderboard(
    @Query('week') week?: string,
    @Query('year') year?: string,
    @Query('limit') limit?: string,
  ) {
    const { weekNumber: defaultWeek, year: defaultYear } = currentWeekYear();
    const weekNumber = week ? parseInt(week, 10) : defaultWeek;
    const yearNum = year ? parseInt(year, 10) : defaultYear;

    return this.leaderboardService.getLeaderboard(
      weekNumber,
      yearNum,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('my-rank')
  @UseGuards(JwtAuthGuard)
  getMyRank(
    @Request() req: { user: { id: string } },
    @Query('week') week?: string,
    @Query('year') year?: string,
  ) {
    const { weekNumber: defaultWeek, year: defaultYear } = currentWeekYear();
    const weekNumber = week ? parseInt(week, 10) : defaultWeek;
    const yearNum = year ? parseInt(year, 10) : defaultYear;

    return this.leaderboardService.getUserRank(
      req.user.id,
      weekNumber,
      yearNum,
    );
  }

  @Get('hub-execution')
  getHubExecution(
    @Query('days') days?: string,
    @Query('min_closed_trades') minClosedTrades?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leaderboardService.getHubExecutionStats({
      days: days ? parseInt(days, 10) : undefined,
      min_closed_trades: minClosedTrades
        ? parseInt(minClosedTrades, 10)
        : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
