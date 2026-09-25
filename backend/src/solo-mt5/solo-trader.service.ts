import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isSoloApp } from '../common/app-variant';
import {
  assertSoloPlatformAdmin,
  isSoloAdminEmail,
} from '../common/solo-admin.util';
import {
  commentBelongsToUser,
  defaultSoloTraderLabel,
  parseSoloTradeUserId,
  roundSoloUsdt,
  sanitizeSoloCommentPart,
  soloTradeComment,
  resolveSoloMaxRiskPercent,
} from '../common/solo-trade-operator.util';
import { isAfterSoloMt5HistoryReset } from '../common/solo-mt5-history-since';
import type { MetaApiDeal } from '../metaapi/metaapi.service';
import {
  SOLO_DAILY_LOSS_LIMIT_USDT,
  SOLO_DAILY_LOSS_LOCKED,
  soloTradingDayKey,
} from '../common/solo-daily-loss.util';

const PNL_REF_PREFIX = 'solo_op_pnl_';

@Injectable()
export class SoloTraderService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { platformWallet: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.snapshot(user);
  }

  async listForAdmin(actorEmail?: string | null) {
    assertSoloPlatformAdmin(actorEmail);
    const users = await this.prisma.user.findMany({
      where: { soloTradeOperator: true },
      include: { platformWallet: true },
      orderBy: { displayName: 'asc' },
    });
    return { traders: users.map((u) => this.snapshot(u)) };
  }

  async setMaxRiskPercent(
    actorEmail: string | null | undefined,
    targetUserId: string,
    maxRiskPercent: number,
  ) {
    assertSoloPlatformAdmin(actorEmail);
    if (!Number.isFinite(maxRiskPercent) || maxRiskPercent < 5 || maxRiskPercent > 100) {
      throw new BadRequestException('Max risk must be between 5 and 100');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('Trader not found');
    if (!target.soloTradeOperator && !isSoloAdminEmail(target.email)) {
      throw new ForbiddenException('That account is not a trade operator');
    }
    const next = roundSoloUsdt(maxRiskPercent);
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { soloMaxRiskPercent: next },
    });
    return this.getMe(targetUserId);
  }

  async resetDailyLoss(
    actorEmail: string | null | undefined,
    targetUserId: string,
  ) {
    assertSoloPlatformAdmin(actorEmail);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('Trader not found');
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        soloDailyPnl: 0,
        soloDailyPnlOn: soloTradingDayKey(),
        soloDailyLossLocked: false,
        soloDailyLossLockedAt: null,
      },
    });
    return this.getMe(targetUserId);
  }

  async assertCanOpenTrades(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        soloTradeOperator: true,
        soloDailyPnl: true,
        soloDailyPnlOn: true,
        soloDailyLossLocked: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (isSoloAdminEmail(user.email)) return;
    if (user.soloDailyLossLocked) {
      throw new ForbiddenException(SOLO_DAILY_LOSS_LOCKED);
    }
    const today = soloTradingDayKey();
    const daily =
      user.soloDailyPnlOn === today ? Number(user.soloDailyPnl ?? 0) : 0;
    if (daily <= -SOLO_DAILY_LOSS_LIMIT_USDT) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          soloDailyPnl: daily,
          soloDailyPnlOn: today,
          soloDailyLossLocked: true,
          soloDailyLossLockedAt: new Date(),
        },
      });
      throw new ForbiddenException(SOLO_DAILY_LOSS_LOCKED);
    }
  }

  async loadOperatorRisk(userId: string): Promise<{
    isOperator: boolean;
    isPlatformAdmin: boolean;
    maxRiskPercent: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        soloTradeOperator: true,
        soloMaxRiskPercent: true,
      },
    });
    return {
      isOperator: Boolean(user?.soloTradeOperator),
      isPlatformAdmin: isSoloAdminEmail(user?.email),
      maxRiskPercent: resolveSoloMaxRiskPercent(user?.soloMaxRiskPercent),
    };
  }

  /** Operators see only their book. Platform admin and other viewers see the full shared book. */
  async tradeScope(userId: string): Promise<{
    isolate: boolean;
    owns: (id?: string | null, comment?: string | null) => boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        displayName: true,
        soloTradeOperator: true,
        soloMaxRiskPercent: true,
      },
    });
    if (!user?.soloTradeOperator || isSoloAdminEmail(user.email)) {
      return { isolate: false, owns: () => true };
    }
    const rows = await this.prisma.soloTradeAttribution.findMany({
      where: { userId },
      select: { positionId: true, orderId: true },
    });
    const ids = new Set(
      rows.flatMap((r) => [r.positionId, r.orderId].filter(Boolean) as string[]),
    );
    const identity = defaultSoloTraderLabel({
      displayName: user.displayName,
      email: user.email,
    });
    return {
      isolate: true,
      owns: (id, comment) => {
        if (id && ids.has(id)) return true;
        return commentBelongsToUser(comment, userId, identity);
      },
    };
  }

  async recordOpen(input: {
    userId: string;
    positionId?: string | null;
    orderId?: string | null;
    comment?: string | null;
  }) {
    if (!isSoloApp()) return;
    const positionId = (input.positionId || input.orderId || '').trim();
    if (!positionId) return;
    const comment = input.comment?.trim() || soloTradeComment(input.userId);
    await this.prisma.soloTradeAttribution.upsert({
      where: { positionId },
      create: {
        userId: input.userId,
        positionId,
        orderId: input.orderId ?? null,
        comment,
      },
      update: {
        userId: input.userId,
        orderId: input.orderId ?? undefined,
        comment,
      },
    });
    if (input.orderId && input.positionId && input.orderId !== input.positionId) {
      await this.prisma.soloTradeAttribution.upsert({
        where: { positionId: input.orderId },
        create: {
          userId: input.userId,
          positionId: input.orderId,
          orderId: input.orderId,
          comment,
        },
        update: { userId: input.userId, comment },
      });
    }
  }

  async settleClosedDeals(deals: MetaApiDeal[]) {
    if (!isSoloApp() || deals.length === 0) return;

    const groups = new Map<string, MetaApiDeal[]>();
    for (const deal of deals) {
      const key = deal.positionId || deal.id;
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(deal);
      groups.set(key, list);
    }

    const positionIds = [...groups.keys()];
    const attributions = await this.prisma.soloTradeAttribution.findMany({
      where: { positionId: { in: positionIds } },
    });
    const attrByPosition = new Map(
      attributions.map((a) => [a.positionId, a.userId]),
    );

    for (const [positionId, group] of groups) {
      group.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
      const closeDeal =
        group.filter((d) => String(d.entry).toUpperCase().includes('OUT')).at(-1) ??
        group[group.length - 1];
      if (!closeDeal) continue;
      if (!isAfterSoloMt5HistoryReset(closeDeal.time)) continue;

      const pnl = roundSoloUsdt(
        group.reduce((sum, d) => sum + d.profit + d.swap + d.commission, 0),
      );
      const stillOpen =
        !group.some((d) => String(d.entry).toUpperCase().includes('OUT')) &&
        Math.abs(pnl) < 1e-8;
      if (stillOpen) continue;

      const fromComment = group
        .map((d) => parseSoloTradeUserId(d.comment))
        .find((id): id is string => Boolean(id));
      const userId = fromComment || attrByPosition.get(positionId);
      if (!userId) continue;

      await this.applyPnl({
        userId,
        positionId,
        dealId: closeDeal.id || positionId,
        pnl,
        symbol: closeDeal.symbol,
      });
    }
  }

  private snapshot(user: {
    id: string;
    email: string | null;
    displayName: string;
    soloTradeOperator: boolean;
    soloMaxRiskPercent: unknown;
    soloRealizedPnl: unknown;
    soloTradeComment?: string | null;
    soloDailyPnl?: unknown;
    soloDailyPnlOn?: string | null;
    soloDailyLossLocked?: boolean | null;
    soloDailyLossLockedAt?: Date | null;
    platformWallet: { availableBalance: unknown } | null;
  }) {
    const realized = Number(user.soloRealizedPnl ?? 0);
    const available = Number(user.platformWallet?.availableBalance ?? 0);
    const today = soloTradingDayKey();
    const daily =
      user.soloDailyPnlOn === today ? Number(user.soloDailyPnl ?? 0) : 0;
    const defaultComment = defaultSoloTraderLabel({
      displayName: user.displayName,
      email: user.email,
    });
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      soloTradeOperator: user.soloTradeOperator,
      maxRiskPercent: resolveSoloMaxRiskPercent(user.soloMaxRiskPercent),
      realizedPnl: roundSoloUsdt(realized),
      dailyPnl: roundSoloUsdt(daily),
      dailyLossLimit: SOLO_DAILY_LOSS_LIMIT_USDT,
      dailyLossLocked: Boolean(user.soloDailyLossLocked),
      dailyLossLockedAt: user.soloDailyLossLockedAt?.toISOString() ?? null,
      availableToWithdraw: roundSoloUsdt(Math.max(0, available)),
      defaultComment,
      tradeComment: user.soloTradeComment?.trim() || defaultComment,
    };
  }

  async setPreferredComment(userId: string, comment: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const next =
      sanitizeSoloCommentPart(comment) ||
      defaultSoloTraderLabel({
        displayName: user.displayName,
        email: user.email,
      });
    await this.prisma.user.update({
      where: { id: userId },
      data: { soloTradeComment: next },
    });
    return this.getMe(userId);
  }

  private async applyPnl(input: {
    userId: string;
    positionId: string;
    dealId: string;
    pnl: number;
    symbol: string;
  }) {
    const referenceId = `${PNL_REF_PREFIX}${input.dealId}`;
    const existing = await this.prisma.walletTransaction.findFirst({
      where: { referenceId },
    });
    if (existing) return;

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      include: { platformWallet: true },
    });
    if (!user) return;
    if (!user.soloTradeOperator && !isSoloAdminEmail(user.email)) return;

    const before = Number(user.platformWallet?.availableBalance ?? 0);
    const nextWallet = roundSoloUsdt(Math.max(0, before + input.pnl));
    const delta = roundSoloUsdt(nextWallet - before);
    const nextRealized = roundSoloUsdt(
      Number(user.soloRealizedPnl ?? 0) + input.pnl,
    );
    const today = soloTradingDayKey();
    const rolled =
      user.soloDailyLossLocked || user.soloDailyPnlOn === today
        ? Number(user.soloDailyPnl ?? 0)
        : 0;
    const nextDaily = roundSoloUsdt(rolled + input.pnl);
    const shouldLock = nextDaily <= -SOLO_DAILY_LOSS_LIMIT_USDT;
    const description =
      input.pnl >= 0
        ? `Trading profit ${input.symbol} — $${input.pnl.toFixed(2)}`
        : `Trading loss ${input.symbol} — $${input.pnl.toFixed(2)}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          soloRealizedPnl: nextRealized,
          soloDailyPnl: nextDaily,
          soloDailyPnlOn: today,
          ...(shouldLock
            ? {
                soloDailyLossLocked: true,
                soloDailyLossLockedAt: user.soloDailyLossLockedAt ?? new Date(),
              }
            : {}),
        },
      });
      await tx.platformWallet.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          availableBalance: nextWallet,
        },
        update: { availableBalance: nextWallet },
      });
      if (delta !== 0) {
        await tx.walletTransaction.create({
          data: {
            userId: input.userId,
            amount: delta,
            type: input.pnl >= 0 ? 'DEPOSITOR_EARNING' : 'ADJUSTMENT',
            referenceId,
            description,
            balanceAfter: nextWallet,
          },
        });
      } else {
        await tx.walletTransaction.create({
          data: {
            userId: input.userId,
            amount: 0,
            type: 'ADJUSTMENT',
            referenceId,
            description: `${description} (wallet floored at $0)`,
            balanceAfter: nextWallet,
          },
        });
      }
    });
  }
}
