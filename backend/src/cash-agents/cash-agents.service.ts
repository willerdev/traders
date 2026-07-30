import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CashAgentStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationService } from '../email/notification.service';
import { UploadStorageService } from '../uploads/upload-storage.service';
import {
  AGENT_CODE_LENGTH,
  AGENT_SESSION_DAYS,
} from './agent.constants';

@Injectable()
export class CashAgentsService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationService,
    private storage: UploadStorageService,
  ) {}

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  private normalizeCode(raw: string) {
    return String(raw ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  private generateCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    const bytes = randomBytes(AGENT_CODE_LENGTH);
    for (let i = 0; i < AGENT_CODE_LENGTH; i++) {
      out += alphabet[bytes[i]! % alphabet.length];
    }
    return out;
  }

  private serializeAgent(agent: {
    id: string;
    displayName: string;
    phone: string | null;
    email: string | null;
    status: CashAgentStatus;
    code: string | null;
    applyNote: string | null;
    adminNote: string | null;
    approvedAt: Date | null;
    createdAt: Date;
    userId: string | null;
  }) {
    return {
      id: agent.id,
      displayName: agent.displayName,
      phone: agent.phone,
      email: agent.email,
      status: agent.status,
      hasCode: Boolean(agent.code),
      applyNote: agent.applyNote,
      adminNote: agent.adminNote,
      approvedAt: agent.approvedAt?.toISOString() ?? null,
      createdAt: agent.createdAt.toISOString(),
      userId: agent.userId,
    };
  }

  async apply(input: {
    displayName: string;
    phone?: string;
    email?: string;
    note?: string;
    userId?: string;
  }) {
    const displayName = String(input.displayName ?? '').trim();
    if (displayName.length < 2) {
      throw new BadRequestException('Name is required');
    }
    const phone = String(input.phone ?? '').trim() || null;
    const email = String(input.email ?? '')
      .trim()
      .toLowerCase() || null;
    if (!phone && !email && !input.userId) {
      throw new BadRequestException('Provide a phone or email so we can reach you');
    }

    if (input.userId) {
      const existing = await this.prisma.cashAgent.findUnique({
        where: { userId: input.userId },
      });
      if (existing) {
        if (existing.status === 'PENDING') {
          throw new BadRequestException('You already have a pending agent application');
        }
        if (existing.status === 'ACTIVE') {
          throw new BadRequestException(
            'You are already an agent — enter your code on the Agent page',
          );
        }
      }
    }

    const agent = await this.prisma.cashAgent.create({
      data: {
        userId: input.userId || null,
        displayName,
        phone,
        email,
        applyNote: String(input.note ?? '').trim() || null,
        status: 'PENDING',
      },
    });

    this.notifications.cashAgentApplied(agent.id, {
      displayName: agent.displayName,
      phone: agent.phone,
      email: agent.email,
      note: agent.applyNote,
    });

    return {
      id: agent.id,
      status: agent.status,
      message:
        'Application received. We will email you an agent code when approved.',
    };
  }

  async openSession(codeRaw: string) {
    const code = this.normalizeCode(codeRaw);
    if (code.length < 4) {
      throw new BadRequestException('Enter a valid agent code');
    }

    const agent = await this.prisma.cashAgent.findFirst({
      where: { code },
    });
    if (!agent || agent.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or inactive agent code');
    }

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + AGENT_SESSION_DAYS);

    await this.prisma.cashAgentSession.create({
      data: {
        agentId: agent.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
      },
    });

    this.notifications.cashAgentSessionOpened(agent.id);

    return {
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      agent: this.serializeAgent(agent),
    };
  }

  async resolveSession(rawToken: string | undefined) {
    const token = String(rawToken ?? '').trim();
    if (!token) {
      throw new UnauthorizedException('Agent session required');
    }
    const session = await this.prisma.cashAgentSession.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { agent: true },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Agent session expired — enter your code again');
    }
    if (session.agent.status !== 'ACTIVE') {
      throw new UnauthorizedException('Agent account is not active');
    }
    await this.prisma.cashAgentSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
    return session.agent;
  }

  async me(agentId: string) {
    const agent = await this.prisma.cashAgent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return this.serializeAgent(agent);
  }

  listOpenJobs(agentId: string) {
    return this.wallet.listMomoP2pForAgent(agentId);
  }

  claimJob(agentId: string, p2pId: string) {
    return this.wallet.claimMomoP2pForAgent(agentId, p2pId);
  }

  async confirmJob(
    agentId: string,
    p2pId: string,
    file?: Express.Multer.File,
    proofUrl?: string,
  ) {
    let url = String(proofUrl ?? '').trim();
    if (file?.buffer?.length) {
      const ext =
        file.mimetype === 'image/png'
          ? '.png'
          : file.mimetype === 'image/webp'
            ? '.webp'
            : '.jpg';
      const filename = `${randomBytes(8).toString('hex')}${ext}`;
      await this.storage.persistFromBuffer(
        'agents',
        filename,
        file.buffer,
        file.mimetype,
      );
      const baseUrl =
        process.env.API_PUBLIC_URL ||
        `http://localhost:${process.env.PORT || 4000}`;
      url = `${baseUrl}/api/v1/uploads/agents/${filename}`;
    }
    if (!url) {
      throw new BadRequestException(
        'Upload a screenshot of the MoMo transfer to confirm',
      );
    }
    return this.wallet.confirmMomoP2pSentByAgent(agentId, p2pId, url);
  }

  async listAdmin(status?: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const where =
      status && status !== 'ALL'
        ? { status: status as CashAgentStatus }
        : {};
    const rows = await this.prisma.cashAgent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        _count: { select: { momoJobs: true } },
      },
    });
    return rows.map((r) => ({
      ...this.serializeAgent(r),
      code: r.code,
      completedJobs: r._count.momoJobs,
      user: r.user,
    }));
  }

  async createAdmin(input: {
    displayName: string;
    phone?: string;
    email?: string;
    code?: string;
    userId?: string;
    adminId: string;
  }) {
    const displayName = String(input.displayName ?? '').trim();
    if (displayName.length < 2) {
      throw new BadRequestException('Name is required');
    }
    let code = this.normalizeCode(input.code ?? '');
    if (!code) code = this.generateCode();
    const existing = await this.prisma.cashAgent.findUnique({ where: { code } });
    if (existing) throw new BadRequestException('That agent code is already in use');

    const agent = await this.prisma.cashAgent.create({
      data: {
        displayName,
        phone: String(input.phone ?? '').trim() || null,
        email: String(input.email ?? '').trim().toLowerCase() || null,
        userId: input.userId || null,
        code,
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedById: input.adminId,
      },
    });

    this.notifications.cashAgentApproved(agent.id, { code });

    return { ...this.serializeAgent(agent), code: agent.code };
  }

  async approve(agentId: string, adminId: string, codeRaw?: string) {
    const agent = await this.prisma.cashAgent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    if (agent.status === 'ACTIVE' && agent.code) {
      return { ...this.serializeAgent(agent), code: agent.code };
    }

    let code = this.normalizeCode(codeRaw ?? '') || agent.code || this.generateCode();
    const clash = await this.prisma.cashAgent.findFirst({
      where: { code, NOT: { id: agentId } },
    });
    if (clash) code = this.generateCode();

    const updated = await this.prisma.cashAgent.update({
      where: { id: agentId },
      data: {
        status: 'ACTIVE',
        code,
        approvedAt: new Date(),
        approvedById: adminId,
      },
    });

    this.notifications.cashAgentApproved(updated.id, { code });

    return { ...this.serializeAgent(updated), code: updated.code };
  }

  async reject(agentId: string, adminId: string, reason?: string) {
    const updated = await this.prisma.cashAgent.update({
      where: { id: agentId },
      data: {
        status: 'REJECTED',
        adminNote: String(reason ?? '').trim() || null,
        approvedById: adminId,
      },
    });
    this.notifications.cashAgentRejected(updated.id, {
      reason: updated.adminNote ?? 'Application declined',
    });
    return this.serializeAgent(updated);
  }

  async suspend(agentId: string, adminId: string, note?: string) {
    const updated = await this.prisma.cashAgent.update({
      where: { id: agentId },
      data: {
        status: 'SUSPENDED',
        adminNote: String(note ?? '').trim() || null,
        approvedById: adminId,
      },
    });
    return this.serializeAgent(updated);
  }
}
