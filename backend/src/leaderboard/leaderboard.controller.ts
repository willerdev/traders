import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  @Get()
  getLeaderboard(
    @Query('week') week?: string,
    @Query('year') year?: string,
    @Query('limit') limit?: string,
  ) {
    const now = new Date();
    const weekNumber = week ? parseInt(week, 10) : this.getWeekNumber(now);
    const yearNum = year ? parseInt(year, 10) : now.getFullYear();

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
    const now = new Date();
    const weekNumber = week ? parseInt(week, 10) : this.getWeekNumber(now);
    const yearNum = year ? parseInt(year, 10) : now.getFullYear();

    return this.leaderboardService.getUserRank(
      req.user.id,
      weekNumber,
      yearNum,
    );
  }

  private getWeekNumber(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  }
}
