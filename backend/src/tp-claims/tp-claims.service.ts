import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService as TradeWalletService } from '../trades/wallet.service';
import { PriceMonitorService } from '../trades/price-monitor.service';
import { NotificationService } from '../email/notification.service';
import { Signal, Trade, TpClaimType } from '@prisma/client';
import { TP_REWARD_USD } from '../common/constants';
import { ProfitShareService } from '../profit-share/profit-share.service';
import { MetaApiService } from '../metaapi/metaapi.service';

@Injectable()
export class TpClaimsService {
  constructor(
    private prisma: PrismaService,
    private tradeWallet: TradeWalletService,
    private priceMonitor: PriceMonitorService,
    private notifications: NotificationService,
    private metaApi: MetaApiService,
    private profitShare: ProfitShareService,
  ) {}

  async hasPendingClaim(signalId: string): Promise<boolean> {
    const pending = await this.prisma.tpClaim.findFirst({
      where: { signalId, status: 'PENDING_REVIEW' },
    });
    return Boolean(pending);
  }

  async createPendingClaim(
    userId: string,
    signal: Signal & { trade: Trade | null },
    exitPrice: number,
    beforeScreenshotUrl: string,
    afterScreenshotUrl: string,
    claimType: TpClaimType = 'FULL_TP',
  ) {
    if (!signal.trade) {
      throw new BadRequestException('Setup has no associated trade record');
    }

    const alreadyApproved = await this.prisma.tpClaim.findFirst({
      where: {
        signalId: signal.id,
        status: 'APPROVED',
      },
      select: { id: true },
    });
    if (alreadyApproved) {
      throw new BadRequestException(
        'A TP claim for this setup was already approved. You cannot claim this setup again.',
      );
    }

    const existing = await this.prisma.tpClaim.findFirst({
      where: { signalId: signal.id, status: 'PENDING_REVIEW' },
    });
    if (existing) {
      throw new BadRequestException(
        'A TP claim for this setup is already awaiting admin review',
      );
    }

    const rejected = await this.prisma.tpClaim.findFirst({
      where: { signalId: signal.id, status: 'REJECTED' },
      orderBy: { submittedAt: 'desc' },
    });
    if (rejected) {
      return this.resubmitClaim(
        rejected.id,
        userId,
        beforeScreenshotUrl,
        afterScreenshotUrl,
      );
    }

    await this.priceMonitor.ensureTradeActivated(
      signal.trade,
      signal,
      exitPrice,
    );

    const claim = await this.prisma.tpClaim.create({
      data: {
        userId,
        signalId: signal.id,
        symbol: signal.symbol,
        direction: signal.direction,
        exitPrice,
        beforeScreenshotUrl,
        afterScreenshotUrl,
        claimType,
        status: 'PENDING_REVIEW',
      },
      include: {
        signal: { select: { signalId: true } },
      },
    });

    await this.ensurePendingTpPayout(claim);

    const isRr1 = claimType === 'RR_1_TO_1';
    return {
      status: 'pending_review' as const,
      claimId: claim.id,
      claimType,
      signalId: signal.signalId,
      message: isRr1
        ? '1:1 RR claim submitted for review. An admin will verify your screenshots, then approve your reward from the payouts list.'
        : 'TP claim submitted for review. An admin will verify your screenshots, then approve your reward from the payouts list.',
    };
  }

  async resubmitClaim(
    claimId: string,
    userId: string,
    beforeScreenshotUrl: string,
    afterScreenshotUrl: string,
  ) {
    const claim = await this.prisma.tpClaim.findUnique({
      where: { id: claimId },
      include: { signal: { include: { trade: true } } },
    });

    if (!claim) throw new NotFoundException('TP claim not found');
    if (claim.userId !== userId) {
      throw new ForbiddenException('You can only resubmit your own TP claims');
    }
    if (claim.status !== 'REJECTED') {
      throw new BadRequestException('Only rejected claims can be resubmitted');
    }
    // OPEN setups and ARCHIVED (auto-expired) setups can be re-claimed —
    // admins can still verify and credit the reward after expiry.
    if (!['OPEN', 'ARCHIVED'].includes(claim.signal.status)) {
      throw new BadRequestException(
        'This setup was already resolved — you cannot resubmit this claim',
      );
    }
    if (!claim.signal.trade) {
      throw new BadRequestException('Setup has no associated trade record');
    }

    const pending = await this.prisma.tpClaim.findFirst({
      where: {
        signalId: claim.signalId,
        status: 'PENDING_REVIEW',
        id: { not: claimId },
      },
    });
    if (pending) {
      throw new BadRequestException(
        'A TP claim for this setup is already awaiting admin review',
      );
    }

    const before = beforeScreenshotUrl.trim();
    const after = afterScreenshotUrl.trim();
    if (!before || !after) {
      throw new BadRequestException(
        'Before and after chart screenshots are required',
      );
    }

    const updated = await this.prisma.tpClaim.update({
      where: { id: claimId },
      data: {
        beforeScreenshotUrl: before,
        afterScreenshotUrl: after,
        status: 'PENDING_REVIEW',
        adminNote: null,
        reviewedAt: null,
        reviewedById: null,
        submittedAt: new Date(),
      },
      include: {
        signal: { select: { signalId: true } },
      },
    });

    await this.ensurePendingTpPayout(updated);

    return {
      status: 'pending_review' as const,
      claimId: updated.id,
      signalId: claim.signal.signalId,
      message:
        'TP claim resubmitted for review. An admin will verify your updated screenshots, then approve your reward from the payouts list.',
    };
  }

  async listUserClaims(userId: string) {
    const [claims, config] = await Promise.all([
      this.prisma.tpClaim.findMany({
        where: { userId },
        orderBy: { submittedAt: 'desc' },
        include: {
          payout: {
            select: {
              id: true,
              status: true,
              walletAddress: true,
              traderShare: true,
              requestedAt: true,
            },
          },
          signal: {
            select: {
              signalId: true,
              entryMin: true,
              entryMax: true,
              stopLoss: true,
              takeProfit: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.platformConfig.findUnique({ where: { id: 'default' } }),
    ]);

    const rewardAmount = Number(config?.tpRewardUsd ?? TP_REWARD_USD);

    return claims.map((c) => ({
      ...this.formatClaim(c),
      rewardAmount,
      canResubmit:
        c.status === 'REJECTED' &&
        ['OPEN', 'ARCHIVED'].includes(c.signal.status ?? ''),
      // Admin credits the platform wallet from Payouts — traders withdraw via /wallet.
      canRequestPayout: false,
      awaitsPayoutApproval:
        c.status === 'APPROVED' &&
        Boolean(c.payout && c.payout.status === 'PENDING'),
      walletCredited: Boolean(c.payout && c.payout.status === 'PAID'),
      payout: c.payout
        ? {
            id: c.payout.id,
            status: c.payout.status,
            walletAddress: c.payout.walletAddress,
            amount: Number(c.payout.traderShare),
            requestedAt: c.payout.requestedAt.toISOString(),
          }
        : null,
    }));
  }

  async listPendingForAdmin() {
    const claims = await this.prisma.tpClaim.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { submittedAt: 'asc' },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        signal: {
          select: {
            signalId: true,
            entryMin: true,
            entryMax: true,
            stopLoss: true,
            takeProfit: true,
            screenshotUrl: true,
          },
        },
      },
    });

    return claims.map((c) => ({
      ...this.formatClaim(c),
      user: c.user,
      originalScreenshotUrl: c.signal.screenshotUrl,
      entryMin: Number(c.signal.entryMin),
      entryMax: Number(c.signal.entryMax),
      stopLoss: Number(c.signal.stopLoss),
      takeProfit: Number(c.signal.takeProfit),
    }));
  }

  async approveClaim(claimId: string, adminId: string) {
    const claim = await this.prisma.tpClaim.findUnique({
      where: { id: claimId },
      include: {
        signal: { include: { trade: true } },
        user: { select: { displayName: true, metaApiAccountId: true } },
      },
    });

    if (!claim) throw new NotFoundException('TP claim not found');
    if (claim.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('This claim is not pending review');
    }
    if (!claim.signal.trade) {
      throw new BadRequestException('Setup has no trade record');
    }

    const existingApprovedForSetup = await this.prisma.tpClaim.findFirst({
      where: {
        signalId: claim.signalId,
        status: 'APPROVED',
        id: { not: claim.id },
      },
      select: { id: true, payout: { select: { id: true } } },
    });
    if (existingApprovedForSetup) {
      throw new BadRequestException(
        'This setup already has an approved TP claim and cannot be approved again.',
      );
    }

    if (
      claim.claimType === 'FULL_TP' &&
      this.metaApi.isConfigured &&
      claim.user
    ) {
      const accountId = this.metaApi.resolveAccountId(
        claim.signal.metaApiAccountId ?? claim.user.metaApiAccountId,
      );
      if (accountId) {
        try {
          await this.metaApi.closeSignalTradeIfOpen({
            accountId,
            displayName: claim.user.displayName,
            userId: claim.userId,
            signalId: claim.signal.signalId,
            symbol: claim.signal.symbol,
            metaApiPositionId: claim.signal.metaApiPositionId,
            metaApiOrderId: claim.signal.metaApiOrderId,
            tradeActivated: Boolean(claim.signal.trade.activatedAt),
          });
        } catch {
          // Position may already be closed when the trader submitted the claim
        }
      }
    }

    const exitPrice = Number(claim.exitPrice);
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const fullReward = Number(config?.tpRewardUsd ?? TP_REWARD_USD);
    const isRr1 = claim.claimType === 'RR_1_TO_1';
    const reward = isRr1 ? Math.round(fullReward * 50) / 100 : fullReward;

    const rewardLabel = isRr1 ? '1:1 RR TP reward' : 'TP reward';

    let result: {
      reward: number;
      newBalance: number;
      signalId: string;
    } | null = await this.tradeWallet.creditTpReward(
      claim.userId,
      claim.signalId,
      exitPrice,
      {
        reward,
        rewardLabel,
        scoringRr: isRr1 ? 1 : Number(claim.signal.riskRewardRatio),
      },
    );

    // Setup already resolved (e.g. closed manually by an admin or auto-expired)
    // — the trader still earned the TP, so credit the reward directly.
    if (!result) {
      result = await this.tradeWallet.creditTpRewardForResolvedSetup(
        claim.userId,
        claim.signalId,
        exitPrice,
        {
          reward,
          rewardLabel,
        },
      );
    }

    if (!result) {
      throw new BadRequestException(
        'Could not credit TP — a reward for this setup was already paid out',
      );
    }

    await this.profitShare.creditEarning(
      claim.userId,
      reward,
      `Setup TP profit share — ${claim.symbol} (${claim.signal.signalId})`,
      claim.signal.signalId,
    );

    const reviewedAt = new Date();

    // Evidence approved — queue / keep a PENDING payout so admin credits
    // the platform wallet from the Payouts list (no auto wallet credit here).
    await this.ensurePendingTpPayout({
      id: claim.id,
      userId: claim.userId,
      symbol: claim.symbol,
      claimType: claim.claimType,
      signal: { signalId: claim.signal.signalId },
    });

    await this.prisma.tpClaim.update({
      where: { id: claimId },
      data: {
        status: 'APPROVED',
        reviewedAt,
        reviewedById: adminId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'TP_CLAIM_APPROVED',
        targetId: claimId,
        metadata: {
          userId: claim.userId,
          signalId: claim.signal.signalId,
          reward: result.reward,
          claimType: claim.claimType,
          platformWalletCredited: false,
          awaitsPayoutApproval: true,
        },
      },
    });

    this.notifications.tpClaimApproved(claim.userId, {
      symbol: claim.symbol,
      reward: result.reward,
      signalId: claim.signal.signalId,
    });

    return {
      status: 'approved',
      claimId,
      reward: result.reward,
      signalId: claim.signal.signalId,
      creditedToWallet: false,
      awaitsPayoutApproval: true,
    };
  }

  /**
   * Ensure every open TP claim has a PENDING payout row so it appears
   * in Admin → Payouts for wallet credit approval.
   */
  async syncPendingClaimPayouts(): Promise<number> {
    const claims = await this.prisma.tpClaim.findMany({
      where: {
        status: { in: ['PENDING_REVIEW', 'APPROVED'] },
        OR: [{ payout: null }, { payout: { status: 'REJECTED' } }],
      },
      include: {
        signal: { select: { signalId: true } },
        payout: { select: { id: true, status: true } },
      },
      take: 200,
    });

    let created = 0;
    for (const claim of claims) {
      if (claim.payout?.status === 'PAID' || claim.payout?.status === 'APPROVED') {
        continue;
      }
      await this.ensurePendingTpPayout(claim);
      created += 1;
    }
    return created;
  }

  private async ensurePendingTpPayout(claim: {
    id: string;
    userId: string;
    symbol: string;
    claimType?: string | null;
    signal: { signalId: string };
  }) {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const fullReward = Number(config?.tpRewardUsd ?? TP_REWARD_USD);
    const isRr1 = claim.claimType === 'RR_1_TO_1';
    const reward = isRr1 ? Math.round(fullReward * 50) / 100 : fullReward;
    const { weekNumber, year } = this.isoWeekYear(new Date());
    const notes = `TP reward — ${claim.symbol} (${claim.signal.signalId})${
      isRr1 ? ' · 1:1 RR' : ''
    }`;

    const existing = await this.prisma.payout.findUnique({
      where: { tpClaimId: claim.id },
    });

    if (existing) {
      if (existing.status === 'PAID' || existing.status === 'APPROVED') {
        return existing;
      }
      return this.prisma.payout.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          virtualProfit: reward,
          traderShare: reward,
          platformShare: 0,
          traderPercent: 100,
          weekNumber,
          year,
          notes,
          processedAt: null,
        },
      });
    }

    return this.prisma.payout.create({
      data: {
        userId: claim.userId,
        tpClaimId: claim.id,
        source: 'TP_REWARD',
        virtualProfit: reward,
        traderShare: reward,
        platformShare: 0,
        traderPercent: 100,
        weekNumber,
        year,
        status: 'PENDING',
        notes,
      },
    });
  }

  private isoWeekYear(date: Date): { weekNumber: number; year: number } {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return { weekNumber, year: d.getUTCFullYear() };
  }

  async rejectClaim(claimId: string, adminId: string, reason: string) {
    const claim = await this.prisma.tpClaim.findUnique({
      where: { id: claimId },
      include: {
        signal: { select: { signalId: true } },
        payout: { select: { id: true, status: true } },
      },
    });

    if (!claim) throw new NotFoundException('TP claim not found');
    if (claim.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('This claim is not pending review');
    }

    const note = reason.trim() || 'Evidence did not confirm take profit';

    await this.prisma.tpClaim.update({
      where: { id: claimId },
      data: {
        status: 'REJECTED',
        adminNote: note,
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    if (claim.payout && claim.payout.status === 'PENDING') {
      await this.prisma.payout.update({
        where: { id: claim.payout.id },
        data: {
          status: 'REJECTED',
          processedAt: new Date(),
          notes: `TP claim rejected — ${note}`,
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'TP_CLAIM_REJECTED',
        targetId: claimId,
        metadata: { userId: claim.userId, reason: note },
      },
    });

    this.notifications.tpClaimRejected(claim.userId, {
      symbol: claim.symbol,
      reason: note,
    });

    return {
      status: 'rejected',
      claimId,
      signalId: claim.signal.signalId,
      adminNote: note,
    };
  }

  private formatClaim(
    claim: {
      id: string;
      userId: string;
      signalId: string;
      symbol: string;
      direction: string;
      exitPrice: unknown;
      beforeScreenshotUrl: string;
      afterScreenshotUrl: string;
      claimType?: string;
      status: string;
      adminNote: string | null;
      reviewedAt: Date | null;
      submittedAt: Date;
      updatedAt: Date;
      signal?: {
        signalId: string;
        entryMin: unknown;
        entryMax: unknown;
        stopLoss: unknown;
        takeProfit: unknown;
        status?: string;
      };
    },
  ) {
    return {
      id: claim.id,
      signalId: claim.signal?.signalId ?? claim.signalId,
      symbol: claim.symbol,
      direction: claim.direction,
      exitPrice: Number(claim.exitPrice),
      beforeScreenshotUrl: claim.beforeScreenshotUrl,
      afterScreenshotUrl: claim.afterScreenshotUrl,
      claimType: claim.claimType,
      status: claim.status,
      adminNote: claim.adminNote,
      reviewedAt: claim.reviewedAt?.toISOString() ?? null,
      submittedAt: claim.submittedAt.toISOString(),
      updatedAt: claim.updatedAt.toISOString(),
      setup: claim.signal
        ? {
            entryMin: Number(claim.signal.entryMin),
            entryMax: Number(claim.signal.entryMax),
            stopLoss: Number(claim.signal.stopLoss),
            takeProfit: Number(claim.signal.takeProfit),
            signalStatus: claim.signal.status ?? 'OPEN',
          }
        : undefined,
    };
  }
}
