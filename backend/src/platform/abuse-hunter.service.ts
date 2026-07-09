import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { currentWeekYear } from '../common/week.util';
import {
  assessAccountAbuse,
  BLOCKED_DEMO_DISPLAY_NAMES,
  isPlatformEmailAllowlisted,
} from '../common/abuse-account.util';

export type AbuseHuntResult = {
  scanned: number;
  bannedCount: number;
  bannedUserIds: string[];
  reasons: Record<string, string[]>;
  trigger: 'startup' | 'cron' | 'manual';
};

@Injectable()
export class AbuseHunterService {
  private readonly logger = new Logger(AbuseHunterService.name);
  private systemAdminId: string | null = null;

  constructor(
    private prisma: PrismaService,
    private leaderboard: LeaderboardService,
  ) {}

  isEnabled(): boolean {
    return process.env.ABUSE_HUNTER_ENABLED !== 'false';
  }

  async runHunt(
    trigger: AbuseHuntResult['trigger'] = 'cron',
  ): Promise<AbuseHuntResult> {
    if (!this.isEnabled()) {
      return {
        scanned: 0,
        bannedCount: 0,
        bannedUserIds: [],
        reasons: {},
        trigger,
      };
    }

    const displayNameFilters = [...BLOCKED_DEMO_DISPLAY_NAMES].map((name) => ({
      displayName: { equals: name, mode: 'insensitive' as const },
    }));

    const candidates = await this.prisma.user.findMany({
      where: {
        status: { not: 'BANNED' },
        role: { not: 'ADMIN' },
        OR: [
          { email: { contains: 'leaderboard.demo', mode: 'insensitive' } },
          {
            email: {
              endsWith: '@traderrank.pro',
              mode: 'insensitive',
            },
          },
          ...displayNameFilters,
        ],
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
      },
    });

    const bannedUserIds: string[] = [];
    const reasons: Record<string, string[]> = {};

    for (const user of candidates) {
      if (isPlatformEmailAllowlisted(user.email)) {
        continue;
      }

      const assessment = assessAccountAbuse(user);
      if (!assessment.abusive) {
        continue;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'BANNED' },
      });
      await this.prisma.leaderboard.deleteMany({ where: { userId: user.id } });
      await this.logBan(user.id, assessment.reasons, user.email, trigger);

      bannedUserIds.push(user.id);
      reasons[user.id] = assessment.reasons;

      this.logger.warn(
        `Banned abusive account ${user.email ?? user.id} (${user.displayName}): ${assessment.reasons.join(', ')}`,
      );
    }

    if (bannedUserIds.length > 0) {
      const { weekNumber, year } = currentWeekYear();
      await this.leaderboard.refreshLeaderboard(weekNumber, year);
    }

    return {
      scanned: candidates.length,
      bannedCount: bannedUserIds.length,
      bannedUserIds,
      reasons,
      trigger,
    };
  }

  private async resolveSystemAdminId(): Promise<string> {
    if (this.systemAdminId) {
      return this.systemAdminId;
    }

    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    this.systemAdminId = admin?.id ?? 'system';
    return this.systemAdminId;
  }

  private async logBan(
    userId: string,
    reasons: string[],
    email: string | null,
    trigger: AbuseHuntResult['trigger'],
  ) {
    const adminId = await this.resolveSystemAdminId();
    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'USER_BANNED',
        targetId: userId,
        metadata: {
          reason: 'abuse_hunter',
          trigger,
          email,
          abuseReasons: reasons,
          automated: true,
        },
      },
    });
  }
}
