import { Injectable, Logger } from '@nestjs/common';
import { Mt5SyncLinkStatus } from '@prisma/client';
import {
  computeMt5SyncExpiry,
  hasActiveMt5Sync,
} from '../common/mt5-sync.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class Mt5SyncBillingService {
  private readonly logger = new Logger(Mt5SyncBillingService.name);

  constructor(private prisma: PrismaService) {}

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        mt5SyncActive: true,
        mt5SyncEnrolledAt: true,
        mt5SyncExpiresAt: true,
        mt5SyncEnabled: true,
        metaApiAccountId: true,
      },
    });
    if (!user) {
      return {
        active: false,
        enabled: false,
        enrolledAt: null,
        expiresAt: null,
        linkedAccountId: null,
        openLinks: 0,
        lastSyncedAt: null,
      };
    }

    const openLinks = await this.prisma.mt5SyncLink.count({
      where: { userId, status: Mt5SyncLinkStatus.OPEN },
    });

    const latestLink = await this.prisma.mt5SyncLink.findFirst({
      where: { userId },
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });

    return {
      active: hasActiveMt5Sync(user),
      enabled: user.mt5SyncEnabled,
      enrolledAt: user.mt5SyncEnrolledAt?.toISOString() ?? null,
      expiresAt: user.mt5SyncExpiresAt?.toISOString() ?? null,
      linkedAccountId: user.metaApiAccountId,
      openLinks,
      lastSyncedAt: latestLink?.lastSyncedAt?.toISOString() ?? null,
    };
  }

  async setEnabled(userId: string, enabled: boolean) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mt5SyncEnabled: enabled },
    });
    return this.getStatus(userId);
  }

  async activate(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const expiresAt = computeMt5SyncExpiry(new Date(), user.mt5SyncExpiresAt);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mt5SyncActive: true,
        mt5SyncEnrolledAt: user.mt5SyncEnrolledAt ?? new Date(),
        mt5SyncExpiresAt: expiresAt,
      },
    });

    this.logger.log(
      `MT5 Live Sync activated for user ${userId} until ${expiresAt.toISOString()}`,
    );
    return this.getStatus(userId);
  }
}
