import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

const MAX_BODY = 4000;

export type MessageView = {
  id: string;
  userId: string;
  senderId: string;
  senderRole: UserRole;
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  fromAdmin: boolean;
};

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  private mapMessage(
    msg: {
      id: string;
      userId: string;
      senderId: string;
      senderRole: UserRole;
      body: string;
      readAt: Date | null;
      createdAt: Date;
      sender: { displayName: string };
    },
    threadUserId: string,
  ): MessageView {
    return {
      id: msg.id,
      userId: msg.userId,
      senderId: msg.senderId,
      senderRole: msg.senderRole,
      senderName: msg.sender.displayName,
      body: msg.body,
      readAt: msg.readAt?.toISOString() ?? null,
      createdAt: msg.createdAt.toISOString(),
      fromAdmin: msg.senderId !== threadUserId,
    };
  }

  async getTraderThread(userId: string) {
    await this.ensureUser(userId);

    const messages = await this.prisma.directMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { displayName: true } } },
    });

    await this.prisma.directMessage.updateMany({
      where: {
        userId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return {
      userId,
      messages: messages.map((m) => this.mapMessage(m, userId)),
      unreadCount: 0,
    };
  }

  async sendTraderMessage(userId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > MAX_BODY) {
      throw new BadRequestException(`Message must be at most ${MAX_BODY} characters`);
    }

    const user = await this.ensureUser(userId);

    const msg = await this.prisma.directMessage.create({
      data: {
        userId,
        senderId: userId,
        senderRole: user.role,
        body: trimmed,
      },
      include: { sender: { select: { displayName: true } } },
    });

    return this.mapMessage(msg, userId);
  }

  async getTraderUnreadCount(userId: string) {
    return this.prisma.directMessage.count({
      where: {
        userId,
        senderId: { not: userId },
        readAt: null,
      },
    });
  }

  async listAdminThreads() {
    const threads = await this.prisma.directMessage.groupBy({
      by: ['userId'],
      _max: { createdAt: true },
    });

    if (threads.length === 0) return { items: [] };

    const userIds = threads.map((t) => t.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, email: true, status: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const latestMessages = await Promise.all(
      userIds.map(async (userId) => {
        const msg = await this.prisma.directMessage.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { displayName: true } } },
        });
        const unread = await this.prisma.directMessage.count({
          where: { userId, senderId: userId, readAt: null },
        });
        return { userId, msg, unread };
      }),
    );

    const items = latestMessages
      .filter((t) => t.msg && userMap.has(t.userId))
      .map((t) => ({
        userId: t.userId,
        displayName: userMap.get(t.userId)!.displayName,
        email: userMap.get(t.userId)!.email,
        status: userMap.get(t.userId)!.status,
        unreadCount: t.unread,
        lastMessage: {
          body: t.msg!.body.slice(0, 120),
          createdAt: t.msg!.createdAt.toISOString(),
          fromAdmin: t.msg!.senderId !== t.userId,
          senderName: t.msg!.sender.displayName,
        },
      }))
      .sort(
        (a, b) =>
          new Date(b.lastMessage.createdAt).getTime() -
          new Date(a.lastMessage.createdAt).getTime(),
      );

    return { items };
  }

  async getAdminThread(traderUserId: string) {
    const user = await this.ensureUser(traderUserId);

    const messages = await this.prisma.directMessage.findMany({
      where: { userId: traderUserId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { displayName: true } } },
    });

    await this.prisma.directMessage.updateMany({
      where: {
        userId: traderUserId,
        senderId: traderUserId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return {
      userId: traderUserId,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      messages: messages.map((m) => this.mapMessage(m, traderUserId)),
      unreadCount: 0,
    };
  }

  async sendAdminMessage(adminId: string, traderUserId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > MAX_BODY) {
      throw new BadRequestException(`Message must be at most ${MAX_BODY} characters`);
    }

    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }

    await this.ensureUser(traderUserId);

    const msg = await this.prisma.directMessage.create({
      data: {
        userId: traderUserId,
        senderId: adminId,
        senderRole: admin.role,
        body: trimmed,
      },
      include: { sender: { select: { displayName: true } } },
    });

    return this.mapMessage(msg, traderUserId);
  }

  async getAdminUnreadTotal() {
    const rows = await this.prisma.directMessage.groupBy({
      by: ['userId'],
    });

    let total = 0;
    for (const row of rows) {
      total += await this.prisma.directMessage.count({
        where: {
          userId: row.userId,
          senderId: row.userId,
          readAt: null,
        },
      });
    }
    return total;
  }

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
