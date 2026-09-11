import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupportAgentService } from '../ai/support-agent.service';
import { NotificationService } from '../email/notification.service';
import { UserRole } from '@prisma/client';

const MAX_BODY = 4000;
const AGENT_EMAIL = 'agent@traderrank.pro';

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
  isAgent: boolean;
};

export type ThreadMeta = {
  agentEnabled: boolean;
  escalatedAt: string | null;
};

@Injectable()
export class MessagesService {
  private agentUserId: string | null = null;

  constructor(
    private prisma: PrismaService,
    private supportAgent: SupportAgentService,
    private notifications: NotificationService,
  ) {}

  private mapMessage(
    msg: {
      id: string;
      userId: string;
      senderId: string;
      senderRole: UserRole;
      body: string;
      isAgent: boolean;
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
      senderName: msg.isAgent ? 'Agent' : msg.sender.displayName,
      body: msg.body,
      readAt: msg.readAt?.toISOString() ?? null,
      createdAt: msg.createdAt.toISOString(),
      fromAdmin: msg.senderId !== threadUserId,
      isAgent: msg.isAgent,
    };
  }

  private async getThreadMeta(userId: string): Promise<ThreadMeta> {
    const state = await this.prisma.messageThreadState.upsert({
      where: { userId },
      create: { userId, agentEnabled: true },
      update: {},
    });
    return {
      agentEnabled: state.agentEnabled,
      escalatedAt: state.escalatedAt?.toISOString() ?? null,
    };
  }

  private async getAgentUserId(): Promise<string> {
    if (this.agentUserId) return this.agentUserId;

    let agent = await this.prisma.user.findUnique({
      where: { email: AGENT_EMAIL },
    });

    if (!agent) {
      agent = await this.prisma.user.create({
        data: {
          email: AGENT_EMAIL,
          displayName: 'Agent',
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          registrationPaid: true,
          passwordHash: '!',
        },
      });
    }

    this.agentUserId = agent.id;
    return agent.id;
  }

  async getTraderThread(userId: string, since?: string) {
    await this.ensureUser(userId);
    const meta = await this.getThreadMeta(userId);

    const sinceDate = since ? new Date(since) : null;
    if (sinceDate && Number.isNaN(sinceDate.getTime())) {
      throw new BadRequestException('Invalid since timestamp');
    }

    const messages = await this.prisma.directMessage.findMany({
      where: {
        userId,
        ...(sinceDate ? { createdAt: { gt: sinceDate } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { displayName: true } } },
    });

    if (!sinceDate) {
      await this.prisma.directMessage.updateMany({
        where: {
          userId,
          senderId: { not: userId },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    }

    return {
      userId,
      messages: messages.map((m) => this.mapMessage(m, userId)),
      unreadCount: 0,
      ...meta,
    };
  }

  async sendTraderMessage(userId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > MAX_BODY) {
      throw new BadRequestException(`Message must be at most ${MAX_BODY} characters`);
    }

    const user = await this.ensureUser(userId);
    const meta = await this.getThreadMeta(userId);

    const escalate =
      this.supportAgent.wantsHumanSupport(trimmed) ||
      /^(speak|talk)\s+to\s+admin$/i.test(trimmed);

    const wantsAgent =
      /\b(talk|chat|speak)\s+(to|with)\s+(the\s+)?agent\b/i.test(trimmed) ||
      /\b(back\s+to\s+agent|resume\s+agent|enable\s+agent)\b/i.test(trimmed) ||
      /^(hi|hello|hey)\s+agent\b/i.test(trimmed);

    const msg = await this.prisma.directMessage.create({
      data: {
        userId,
        senderId: userId,
        senderRole: user.role,
        body: trimmed,
      },
      include: { sender: { select: { displayName: true } } },
    });

    const replies: MessageView[] = [];

    if (escalate) {
      await this.escalateThread(userId, {
        trigger: 'User requested human admin',
        reason: trimmed,
        notify: true,
      });

      const agentReply = await this.createAgentMessage(
        userId,
        'Understood — I have notified our admin team. A human will reply here as soon as possible, usually within 24 hours. You can keep sending details while you wait, or tap “Chat with Agent” to talk to me again.',
      );
      replies.push(agentReply);

      return {
        message: this.mapMessage(msg, userId),
        replies,
        agentEnabled: false,
        escalated: true,
      };
    }

    let agentEnabled = meta.agentEnabled;

    if (!agentEnabled && wantsAgent) {
      await this.prisma.messageThreadState.update({
        where: { userId },
        data: { agentEnabled: true, escalatedAt: null },
      });
      agentEnabled = true;
    }

    if (!agentEnabled) {
      this.notifications.supportChatFollowUp(userId, {
        displayName: user.displayName,
        email: user.email,
        message: trimmed,
      });
    }

    if (agentEnabled) {
      const history = await this.buildAgentHistory(userId);
      const agentResult = await this.supportAgent.generateReply(
        userId,
        trimmed,
        history,
      );

      if (agentResult.escalate) {
        await this.escalateThread(userId, {
          trigger: 'Agent escalated',
          reason: agentResult.escalateReason ?? trimmed,
          notify: true,
        });
        const agentReply = await this.createAgentMessage(
          userId,
          agentResult.text,
        );
        replies.push(agentReply);
        return {
          message: this.mapMessage(msg, userId),
          replies,
          agentEnabled: false,
          escalated: true,
        };
      }

      const agentReply = await this.createAgentMessage(
        userId,
        agentResult.text,
      );
      replies.push(agentReply);
    }

    return {
      message: this.mapMessage(msg, userId),
      replies,
      agentEnabled,
      escalated: !agentEnabled,
    };
  }

  async requestHumanAdmin(userId: string) {
    await this.ensureUser(userId);

    await this.escalateThread(userId, {
      trigger: 'Speak to admin button',
      reason: 'User tapped Speak to admin',
      notify: true,
    });

    const agentReply = await this.createAgentMessage(
      userId,
      'You are now connected to our admin queue. A team member will reply here — typically within 24 hours. Feel free to describe your issue below. You can tap “Chat with Agent” anytime to talk to me again.',
    );

    return {
      agentEnabled: false,
      escalated: true,
      reply: agentReply,
    };
  }

  async resumeAgent(userId: string) {
    await this.ensureUser(userId);

    await this.prisma.messageThreadState.upsert({
      where: { userId },
      create: { userId, agentEnabled: true, escalatedAt: null },
      update: { agentEnabled: true, escalatedAt: null },
    });

    const agentReply = await this.createAgentMessage(
      userId,
      'Agent is back. Ask me about VIP withdrawals, wallet ↔ investment transfers, KYC, setups, or how the platform works.',
    );

    return {
      agentEnabled: true,
      escalated: false,
      reply: agentReply,
    };
  }

  private async createAgentMessage(
    userId: string,
    body: string,
  ): Promise<MessageView> {
    const agentId = await this.getAgentUserId();
    const msg = await this.prisma.directMessage.create({
      data: {
        userId,
        senderId: agentId,
        senderRole: 'ADMIN',
        body,
        isAgent: true,
      },
      include: { sender: { select: { displayName: true } } },
    });
    return this.mapMessage(msg, userId);
  }

  private async buildAgentHistory(userId: string) {
    const recent = await this.prisma.directMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 16,
      include: { sender: { select: { displayName: true } } },
    });

    return recent
      .reverse()
      .filter((m) => m.senderId === userId || m.isAgent)
      .map((m) => ({
        role: (m.senderId === userId ? 'user' : 'assistant') as
          | 'user'
          | 'assistant',
        content: m.body,
      }));
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

    const states = await this.prisma.messageThreadState.findMany({
      where: { userId: { in: userIds } },
    });
    const stateMap = new Map(states.map((s) => [s.userId, s]));

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
      .map((t) => {
        const state = stateMap.get(t.userId);
        return {
          userId: t.userId,
          displayName: userMap.get(t.userId)!.displayName,
          email: userMap.get(t.userId)!.email,
          status: userMap.get(t.userId)!.status,
          unreadCount: t.unread,
          agentEnabled: state?.agentEnabled ?? true,
          escalatedAt: state?.escalatedAt?.toISOString() ?? null,
          lastMessage: {
            body: t.msg!.body.slice(0, 120),
            createdAt: t.msg!.createdAt.toISOString(),
            fromAdmin: t.msg!.senderId !== t.userId,
            isAgent: t.msg!.isAgent,
            senderName: t.msg!.isAgent
              ? 'Agent'
              : t.msg!.sender.displayName,
          },
        };
      })
      .sort((a, b) => {
        const aEsc = !a.agentEnabled ? 1 : 0;
        const bEsc = !b.agentEnabled ? 1 : 0;
        if (aEsc !== bEsc) return bEsc - aEsc;
        if (a.unreadCount !== b.unreadCount) {
          return b.unreadCount - a.unreadCount;
        }
        return (
          new Date(b.lastMessage.createdAt).getTime() -
          new Date(a.lastMessage.createdAt).getTime()
        );
      });

    return { items };
  }

  async getAdminThread(traderUserId: string, since?: string) {
    const user = await this.ensureUser(traderUserId);
    const meta = await this.getThreadMeta(traderUserId);

    const sinceDate = since ? new Date(since) : null;
    if (sinceDate && Number.isNaN(sinceDate.getTime())) {
      throw new BadRequestException('Invalid since timestamp');
    }

    const messages = await this.prisma.directMessage.findMany({
      where: {
        userId: traderUserId,
        ...(sinceDate ? { createdAt: { gt: sinceDate } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { displayName: true } } },
    });

    if (!sinceDate) {
      await this.prisma.directMessage.updateMany({
        where: {
          userId: traderUserId,
          senderId: traderUserId,
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    }

    return {
      userId: traderUserId,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      messages: messages.map((m) => this.mapMessage(m, traderUserId)),
      unreadCount: 0,
      ...meta,
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

    if (admin.email === AGENT_EMAIL) {
      throw new ForbiddenException('Use the support agent account only for automated replies');
    }

    await this.ensureUser(traderUserId);

    await this.prisma.messageThreadState.upsert({
      where: { userId: traderUserId },
      create: { userId: traderUserId, agentEnabled: false, escalatedAt: new Date() },
      update: { agentEnabled: false },
    });

    const msg = await this.prisma.directMessage.create({
      data: {
        userId: traderUserId,
        senderId: adminId,
        senderRole: admin.role,
        body: trimmed,
        isAgent: false,
      },
      include: { sender: { select: { displayName: true } } },
    });

    await this.ensureUser(traderUserId);

    this.notifications.supportAdminReply(traderUserId, {
      adminName: admin.displayName,
      preview: trimmed,
    });

    return this.mapMessage(msg, traderUserId);
  }

  private async escalateThread(
    userId: string,
    opts: { trigger: string; reason: string; notify: boolean },
  ) {
    const wasEscalated = await this.prisma.messageThreadState.findUnique({
      where: { userId },
      select: { agentEnabled: true },
    });

    await this.prisma.messageThreadState.upsert({
      where: { userId },
      create: { userId, agentEnabled: false, escalatedAt: new Date() },
      update: { agentEnabled: false, escalatedAt: new Date() },
    });

    if (opts.notify && wasEscalated?.agentEnabled !== false) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, email: true },
      });
      if (user) {
        const summary = await this.buildChatSummary(userId);
        this.notifications.supportChatEscalated(userId, {
          displayName: user.displayName,
          email: user.email,
          trigger: opts.trigger,
          reason: opts.reason,
          chatSummary: summary,
        });
      }
    }
  }

  private async buildChatSummary(userId: string): Promise<string> {
    const recent = await this.prisma.directMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { sender: { select: { displayName: true } } },
    });
    return recent
      .reverse()
      .map((m) => {
        const who = m.isAgent
          ? 'Agent'
          : m.senderId === userId
            ? 'User'
            : m.sender.displayName;
        const body =
          m.body.length > 240 ? `${m.body.slice(0, 237)}…` : m.body;
        return `${who}: ${body}`;
      })
      .join('\n');
  }

  async getAdminUnreadTotal() {
    const escalated = await this.prisma.messageThreadState.findMany({
      where: { agentEnabled: false },
      select: { userId: true },
    });
    const escalatedIds = new Set(escalated.map((s) => s.userId));

    const rows = await this.prisma.directMessage.groupBy({
      by: ['userId'],
    });

    let total = 0;
    for (const row of rows) {
      if (!escalatedIds.has(row.userId)) continue;
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
