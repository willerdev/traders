import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformNotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    linkUrl?: string;
    signalId?: string;
  }) {
    return this.prisma.platformNotification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl ?? null,
        signalId: input.signalId ?? null,
      },
    });
  }

  async listForUser(userId: string, limit = 30) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.platformNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 100),
      }),
      this.prisma.platformNotification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      unreadCount,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        linkUrl: n.linkUrl,
        signalId: n.signalId,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async markRead(userId: string, notificationId: string) {
    const row = await this.prisma.platformNotification.findUnique({
      where: { id: notificationId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.userId !== userId) {
      throw new ForbiddenException('Not your notification');
    }
    if (row.readAt) return { ok: true };

    await this.prisma.platformNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.platformNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
