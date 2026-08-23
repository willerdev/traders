import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutService } from './payout.service';
import { NotificationService } from '../email/notification.service';
import { ReferralsService } from '../referrals/referrals.service';
import {
  SUNDAY_BATCH_ADJUSTMENT_PERCENT,
  SUNDAY_BATCH_CRON_ACTOR,
  SUNDAY_BATCH_HOUR_MS,
  applySundayBatchAdjustment,
  formatKampalaDateTime,
  isSameSundayUtc,
  isSundayUtc,
  nextUtcHour,
  sundayUtcEnd,
  sundayUtcStart,
} from './sunday-withdraw-batch.util';

const SYSTEM_ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';

type BatchRow = {
  payoutId: string;
  userId: string;
  displayName: string;
  email: string | null;
  originalNet: number;
  adjustedNet: number;
  scheduledAt: Date;
  status: string;
  executedAt?: Date | null;
  gatewayPayoutId?: string | null;
  error?: string;
};

@Injectable()
export class SundayWithdrawBatchService {
  private readonly logger = new Logger(SundayWithdrawBatchService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutService,
    private readonly notifications: NotificationService,
    private readonly referrals: ReferralsService,
  ) {}

  /** Runs every few minutes on Sundays — queue new requests, approve one due payout, finalize. */
  async runSundayBatchTick() {
    if (!isSundayUtc()) return { skipped: 'not_sunday' as const };

    if (this.processing) {
      return { skipped: 'already_running' as const };
    }

    this.processing = true;
    try {
      const queued = await this.queuePendingSundayWithdrawals();
      const approved = await this.approveNextDueWithdrawal();
      const finalized = await this.finalizeBatchIfComplete();
      return { queued, approved, finalized };
    } finally {
      this.processing = false;
    }
  }

  private async queuePendingSundayWithdrawals(): Promise<{ queued: number }> {
    const now = new Date();
    const dayStart = sundayUtcStart(now);
    const dayEnd = sundayUtcEnd(now);

    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const anchor =
      config?.sundayWithdrawBatchAnchor &&
      isSameSundayUtc(config.sundayWithdrawBatchAnchor, now)
        ? config.sundayWithdrawBatchAnchor
        : null;

    const pending = await this.prisma.payout.findMany({
      where: {
        status: 'PENDING',
        source: 'DEPOSITOR',
        walletAddress: { not: null },
        payoutMethod: { not: 'MOBILE_MONEY' },
        requestedAt: { gte: dayStart, lte: dayEnd },
        momoP2p: { is: null },
      },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { requestedAt: 'asc' },
    });

    const toQueue = pending.filter((p) => !p.scheduledApproveAt);
    if (toQueue.length === 0) return { queued: 0 };

    let batchAnchor = anchor ?? nextUtcHour(now);
    if (!anchor) {
      await this.prisma.platformConfig.update({
        where: { id: 'default' },
        data: {
          sundayWithdrawBatchAnchor: batchAnchor,
          sundayWithdrawBatchFinalizedAt: null,
        },
      });
    } else {
      const lastScheduled = await this.prisma.payout.findFirst({
        where: {
          scheduledApproveAt: { not: null, gte: dayStart },
        },
        orderBy: { scheduledApproveAt: 'desc' },
      });
      if (lastScheduled?.scheduledApproveAt) {
        batchAnchor = new Date(
          lastScheduled.scheduledApproveAt.getTime() + SUNDAY_BATCH_HOUR_MS,
        );
      }
    }

    let slot = batchAnchor;
    let queued = 0;

    for (const payout of toQueue) {
      const originalNet = Number(payout.traderShare);
      const { adjustedNet, reduction } =
        applySundayBatchAdjustment(originalNet);
      const scheduledAt = new Date(slot);
      slot = new Date(slot.getTime() + SUNDAY_BATCH_HOUR_MS);

      const noteSuffix = `Sunday batch ${SUNDAY_BATCH_ADJUSTMENT_PERCENT}% adjustment: net $${originalNet.toFixed(2)} → $${adjustedNet.toFixed(2)} USDT; scheduled ${formatKampalaDateTime(scheduledAt)} Kampala`;

      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          traderShare: adjustedNet,
          platformShare:
            Math.round((Number(payout.platformShare) + reduction) * 100) / 100,
          scheduledApproveAt: scheduledAt,
          notes: `${payout.notes ?? ''} — ${noteSuffix}`.trim(),
        },
      });

      if (payout.user.email && !payout.sundayBatchEtaNotifiedAt) {
        const ok = await this.notifications.walletWithdrawSundayQueued(
          payout.user.id,
          {
            gross: Number(payout.virtualProfit),
            netPayout: adjustedNet,
            originalNet,
            adjustmentPercent: SUNDAY_BATCH_ADJUSTMENT_PERCENT,
            queuePosition: queued + 1,
            estimatedAt: scheduledAt.toISOString(),
          },
        );
        if (ok) {
          await this.prisma.payout.update({
            where: { id: payout.id },
            data: { sundayBatchEtaNotifiedAt: new Date() },
          });
        }
      }

      queued++;
      this.logger.log(
        `Sunday batch queued ${payout.user.displayName} ($${adjustedNet.toFixed(2)}) at ${formatKampalaDateTime(scheduledAt)}`,
      );
    }

    return { queued };
  }

  private async approveNextDueWithdrawal(): Promise<{
    approved: boolean;
    payoutId?: string;
    error?: string;
  }> {
    const now = new Date();
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    if (config?.sundayWithdrawBatchFinalizedAt) {
      return { approved: false };
    }

    const due = await this.prisma.payout.findFirst({
      where: {
        status: 'PENDING',
        source: 'DEPOSITOR',
        scheduledApproveAt: { not: null, lte: now },
      },
      orderBy: { scheduledApproveAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    if (!due) return { approved: false };

    try {
      const result = await this.payouts.approveAndSendPayout(
        due.id,
        SUNDAY_BATCH_CRON_ACTOR,
        'TRC20',
        { skipSafetyHold: true },
      );

      await this.prisma.payout.update({
        where: { id: due.id },
        data: {
          processedAt: new Date(),
          notes: `${due.notes ?? ''} — Sunday batch approved ${formatKampalaDateTime(new Date())} Kampala`.trim(),
        },
      });

      this.logger.log(
        `Sunday batch approved ${due.user.displayName} payout ${due.id}`,
      );

      return {
        approved: true,
        payoutId: due.id,
        error:
          'message' in result && typeof result.message === 'string'
            ? result.message
            : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sunday batch approve failed ${due.id}: ${message}`);
      await this.prisma.payout.update({
        where: { id: due.id },
        data: {
          notes: `${due.notes ?? ''} — Sunday batch approve failed: ${message}`.trim(),
          scheduledApproveAt: new Date(now.getTime() + SUNDAY_BATCH_HOUR_MS),
        },
      });
      return { approved: false, payoutId: due.id, error: message };
    }
  }

  private async finalizeBatchIfComplete(): Promise<{ finalized: boolean }> {
    const now = new Date();
    const dayStart = sundayUtcStart(now);

    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    if (
      !config?.sundayWithdrawBatchAnchor ||
      !isSameSundayUtc(config.sundayWithdrawBatchAnchor, now) ||
      config.sundayWithdrawBatchFinalizedAt
    ) {
      return { finalized: false };
    }

    const remaining = await this.prisma.payout.count({
      where: {
        status: 'PENDING',
        source: 'DEPOSITOR',
        scheduledApproveAt: { not: null, gte: dayStart },
      },
    });
    if (remaining > 0) return { finalized: false };

    const batchRows = await this.buildBatchSummary(dayStart);
    await this.notifications.sundayWithdrawBatchAdminSummary(batchRows);
    const kycApproved = await this.approveAllPendingKyc();

    await this.prisma.platformConfig.update({
      where: { id: 'default' },
      data: { sundayWithdrawBatchFinalizedAt: new Date() },
    });

    this.logger.log(
      `Sunday batch finalized — ${batchRows.length} payout(s), KYC approved: ${kycApproved}`,
    );
    return { finalized: true };
  }

  private async buildBatchSummary(dayStart: Date): Promise<BatchRow[]> {
    const payouts = await this.prisma.payout.findMany({
      where: {
        source: 'DEPOSITOR',
        scheduledApproveAt: { not: null, gte: dayStart },
      },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { scheduledApproveAt: 'asc' },
    });

    return payouts.map((p) => {
      const notes = p.notes ?? '';
      const originalMatch = notes.match(
        /Sunday batch 9% adjustment: net \$([0-9.]+)/,
      );
      const originalNet = originalMatch
        ? Number(originalMatch[1])
        : Number(p.traderShare);
      return {
        payoutId: p.id,
        userId: p.userId,
        displayName: p.user.displayName,
        email: p.user.email,
        originalNet,
        adjustedNet: Number(p.traderShare),
        scheduledAt: p.scheduledApproveAt!,
        status: p.status,
        executedAt: p.processedAt,
        gatewayPayoutId: p.gatewayPayoutId,
      };
    });
  }

  private async approveAllPendingKyc(): Promise<number> {
    const pending = await this.prisma.kycVerification.findMany({
      where: { status: 'PENDING' },
    });
    let approved = 0;
    for (const kyc of pending) {
      await this.prisma.kycVerification.update({
        where: { userId: kyc.userId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });
      await this.prisma.auditLog.create({
        data: {
          adminId: SYSTEM_ADMIN_ID,
          action: 'KYC_APPROVED',
          targetId: kyc.userId,
          metadata: { source: SUNDAY_BATCH_CRON_ACTOR },
        },
      });
      this.notifications.kycApproved(kyc.userId);
      await this.referrals.rewardForKyc(kyc.userId).catch(() => undefined);
      approved++;
    }
    return approved;
  }
}
