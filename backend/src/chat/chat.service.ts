import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../email/notification.service';

const MAX_BODY = 4000;

export type PeerChatMessageView = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

export type ChatConversationView = {
  id: string;
  peer: {
    id: string;
    displayName: string;
    email: string | null;
  };
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
  createdAt: string;
};

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  private async assertParticipant(conversationId: string, userId: string) {
    const part = await this.prisma.chatParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    if (!part) {
      throw new ForbiddenException('Not a participant in this conversation');
    }
    return part;
  }

  private async mapConversation(
    conversationId: string,
    viewerId: string,
  ): Promise<ChatConversationView> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, displayName: true, email: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            createdAt: true,
            senderId: true,
          },
        },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const me = conversation.participants.find((p) => p.userId === viewerId);
    if (!me) {
      throw new ForbiddenException('Not a participant in this conversation');
    }
    const peer = conversation.participants.find((p) => p.userId !== viewerId);
    if (!peer) {
      throw new BadRequestException('Conversation has no peer');
    }

    const lastReadAt = me.lastReadAt ?? new Date(0);
    const unreadCount = await this.prisma.peerMessage.count({
      where: {
        conversationId,
        senderId: { not: viewerId },
        createdAt: { gt: lastReadAt },
      },
    });

    const last = conversation.messages[0] ?? null;
    return {
      id: conversation.id,
      peer: {
        id: peer.user.id,
        displayName: peer.user.displayName,
        email: peer.user.email,
      },
      lastMessage: last
        ? {
            id: last.id,
            body: last.body,
            createdAt: last.createdAt.toISOString(),
            senderId: last.senderId,
          }
        : null,
      unreadCount,
      updatedAt: conversation.updatedAt.toISOString(),
      createdAt: conversation.createdAt.toISOString(),
    };
  }

  async startByEmail(userId: string, recipientEmailRaw: string) {
    const recipientEmail = String(recipientEmailRaw ?? '')
      .trim()
      .toLowerCase();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new BadRequestException('Enter a valid recipient email');
    }

    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, email: true },
    });
    if (!me || me.status === 'BANNED' || me.status === 'SUSPENDED') {
      throw new BadRequestException('Account cannot start chats');
    }

    const peer = await this.prisma.user.findFirst({
      where: { email: { equals: recipientEmail, mode: 'insensitive' } },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
      },
    });
    if (!peer) {
      throw new NotFoundException('No user found with that email');
    }
    if (peer.id === userId) {
      throw new BadRequestException('You cannot chat with yourself');
    }
    if (peer.status === 'BANNED' || peer.status === 'SUSPENDED') {
      throw new BadRequestException('That account cannot receive messages');
    }

    const existing = await this.prisma.chatConversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: peer.id } } },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      return this.mapConversation(existing.id, userId);
    }

    const created = await this.prisma.chatConversation.create({
      data: {
        participants: {
          create: [{ userId }, { userId: peer.id }],
        },
      },
      select: { id: true },
    });
    return this.mapConversation(created.id, userId);
  }

  async listInbox(userId: string): Promise<ChatConversationView[]> {
    const parts = await this.prisma.chatParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    if (parts.length === 0) return [];

    const conversations = await Promise.all(
      parts.map((p) => this.mapConversation(p.conversationId, userId)),
    );
    return conversations.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async getMessages(
    userId: string,
    conversationId: string,
    since?: string,
  ): Promise<{ messages: PeerChatMessageView[] }> {
    await this.assertParticipant(conversationId, userId);

    const sinceDate =
      since && !Number.isNaN(Date.parse(since)) ? new Date(since) : null;

    const rows = await this.prisma.peerMessage.findMany({
      where: {
        conversationId,
        ...(sinceDate ? { createdAt: { gt: sinceDate } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        sender: { select: { displayName: true } },
      },
    });

    await this.prisma.chatParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { lastReadAt: new Date() },
    });

    return {
      messages: rows.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName: m.sender.displayName,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        mine: m.senderId === userId,
      })),
    };
  }

  async sendMessage(userId: string, conversationId: string, bodyRaw: string) {
    const body = String(bodyRaw ?? '').trim();
    if (!body) {
      throw new BadRequestException('Message cannot be empty');
    }
    if (body.length > MAX_BODY) {
      throw new BadRequestException(
        `Message is too long (max ${MAX_BODY} characters)`,
      );
    }

    await this.assertParticipant(conversationId, userId);

    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, status: true },
    });
    if (!sender || sender.status === 'BANNED' || sender.status === 'SUSPENDED') {
      throw new BadRequestException('Account cannot send messages');
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.peerMessage.create({
        data: {
          conversationId,
          senderId: userId,
          body,
        },
        include: {
          sender: { select: { displayName: true } },
        },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      await tx.chatParticipant.update({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        data: { lastReadAt: new Date() },
      });
      return created;
    });

    const peer = await this.prisma.chatParticipant.findFirst({
      where: {
        conversationId,
        userId: { not: userId },
      },
      select: { userId: true, lastReadAt: true },
    });
    if (peer) {
      const activelyReading =
        peer.lastReadAt != null &&
        Date.now() - peer.lastReadAt.getTime() < 2 * 60 * 1000;
      if (!activelyReading) {
        this.notifications.peerChatMessage(peer.userId, {
          fromName: sender.displayName,
          preview: body,
          conversationId,
        });
      }
    }

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.sender.displayName,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      mine: true,
    } satisfies PeerChatMessageView;
  }

  async unreadCount(userId: string): Promise<number> {
    const parts = await this.prisma.chatParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });
    if (parts.length === 0) return 0;

    let total = 0;
    for (const part of parts) {
      const lastReadAt = part.lastReadAt ?? new Date(0);
      total += await this.prisma.peerMessage.count({
        where: {
          conversationId: part.conversationId,
          senderId: { not: userId },
          createdAt: { gt: lastReadAt },
        },
      });
    }
    return total;
  }
}
