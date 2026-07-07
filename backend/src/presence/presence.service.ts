import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** User is online if heartbeat arrived within this window. */
export const PRESENCE_ONLINE_MS = 45_000;
/** Show recently-offline users up to this age in the admin live view. */
export const PRESENCE_RECENT_OFFLINE_MS = 30 * 60_000;

const PATH_LABELS: Record<string, string> = {
  '/': 'Home',
  '/dashboard': 'Dashboard',
  '/submit': 'Submit setup',
  '/mt5': 'MT5',
  '/mt5/copy': 'MT5 Copy',
  '/leaderboard': 'Leaderboard',
  '/settings': 'Settings',
  '/tp-claims': 'TP Claims',
  '/register': 'Register',
  '/login': 'Login',
  '/support': 'Support',
};

@Injectable()
export class PresenceService {
  constructor(private prisma: PrismaService) {}

  formatPathLabel(path: string | null | undefined): string {
    if (!path) return 'Unknown';
    const base = path.split('?')[0] || '/';
    if (PATH_LABELS[base]) return PATH_LABELS[base];
    if (base.startsWith('/settings')) return 'Settings';
    return base;
  }

  async recordHeartbeat(userId: string, path: string) {
    const safePath = path.trim().slice(0, 256) || '/';
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        presenceLastSeenAt: new Date(),
        presencePath: safePath,
      },
    });
    return { ok: true };
  }

  async getLiveSnapshot() {
    const now = Date.now();
    const onlineSince = new Date(now - PRESENCE_ONLINE_MS);
    const recentSince = new Date(now - PRESENCE_RECENT_OFFLINE_MS);

    const users = await this.prisma.user.findMany({
      where: {
        presenceLastSeenAt: { gte: recentSince },
        role: { not: 'ADMIN' },
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        registrationPaid: true,
        presenceLastSeenAt: true,
        presencePath: true,
      },
      orderBy: { presenceLastSeenAt: 'desc' },
      take: 200,
    });

    const mapRow = (u: (typeof users)[number]) => {
      const lastSeenAt = u.presenceLastSeenAt!;
      const secondsAgo = Math.max(
        0,
        Math.round((now - lastSeenAt.getTime()) / 1000),
      );
      const online = lastSeenAt >= onlineSince;
      return {
        userId: u.id,
        displayName: u.displayName,
        email: u.email,
        status: u.status,
        registrationPaid: u.registrationPaid,
        currentPath: u.presencePath ?? '/',
        pathLabel: this.formatPathLabel(u.presencePath),
        lastSeenAt: lastSeenAt.toISOString(),
        secondsAgo,
        online,
      };
    };

    const rows = users.map(mapRow);
    const online = rows.filter((r) => r.online);
    const recentOffline = rows.filter((r) => !r.online);

    return {
      onlineCount: online.length,
      recentOfflineCount: recentOffline.length,
      onlineThresholdSeconds: PRESENCE_ONLINE_MS / 1000,
      polledAt: new Date().toISOString(),
      online,
      recentOffline,
    };
  }
}
