import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../trades/wallet.service';
import { PriceMonitorService } from '../trades/price-monitor.service';
import { NotificationService } from '../email/notification.service';
import { Signal, Trade, TpClaimType } from '@prisma/client';
import { TP_REWARD_USD } from '../common/constants';

@Injectable()
export class TpClaimsService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private priceMonitor: PriceMonitorService,
    private notifications: NotificationService,
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
    });

    const isRr1 = claimType === 'RR_1_TO_1';
    return {
      status: 'pending_review' as const,
      claimId: claim.id,
      claimType,
      signalId: signal.signalId,
      message: isRr1
        ? '1:1 RR claim submitted for review. An admin will verify your before/after screenshots before crediting your reward.'
        : 'TP claim submitted for review. Upload confirmed — an admin will verify your before/after screenshots before crediting your account.',
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
    if (claim.signal.status !== 'OPEN') {
      throw new BadRequestException(
        'This setup is no longer open — you cannot resubmit this claim',
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
    });

    return {
      status: 'pending_review' as const,
      claimId: updated.id,
      signalId: claim.signal.signalId,
      message:
        'TP claim resubmitted for review. An admin will verify your updated screenshots.',
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
      canResubmit: c.status === 'REJECTED' && c.signal.status === 'OPEN',
      canRequestPayout: c.status === 'APPROVED' && !c.payout,
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
      include: { signal: { include: { trade: true } } },
    });

    if (!claim) throw new NotFoundException('TP claim not found');
    if (claim.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('This claim is not pending review');
    }
    if (!claim.signal.trade) {
      throw new BadRequestException('Setup has no trade record');
    }

    const exitPrice = Number(claim.exitPrice);
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const fullReward = Number(config?.tpRewardUsd ?? TP_REWARD_USD);
    const isRr1 = claim.claimType === 'RR_1_TO_1';
    const reward = isRr1 ? Math.round(fullReward * 50) / 100 : fullReward;

    const result = await this.wallet.creditTpReward(
      claim.userId,
      claim.signalId,
      exitPrice,
      {
        reward,
        rewardLabel: isRr1 ? '1:1 RR TP reward' : 'TP reward',
        scoringRr: isRr1 ? 1 : Number(claim.signal.riskRewardRatio),
      },
    );

    if (!result) {
      throw new BadRequestException(
        'Could not credit TP — setup may already be resolved',
      );
    }

    await this.prisma.tpClaim.update({
      where: { id: claimId },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
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
    };
  }

  async rejectClaim(claimId: string, adminId: string, reason: string) {
    const claim = await this.prisma.tpClaim.findUnique({
      where: { id: claimId },
      include: { signal: { select: { signalId: true } } },
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
