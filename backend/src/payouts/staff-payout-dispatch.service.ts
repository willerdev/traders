import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PayoutMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatKampalaDateTime } from './sunday-withdraw-batch.util';
import {
  STAFF_DISPATCH_INTERVAL_MS,
  buildDispatchSchedule,
  isStaffDispatchOperator,
  stripPriorStaffDispatchNotes,
} from './staff-payout-dispatch.util';

export type StaffDispatchRow = {
  position: number;
  payoutId: string;
  displayName: string;
  email: string | null;
  amount: number;
  walletAddress: string;
  scheduledAt: string;
  scheduledAtEat: string;
};

@Injectable()
export class StaffPayoutDispatchService {
  constructor(private readonly prisma: PrismaService) {}

  assertOperator(email: string | null | undefined) {
    if (!isStaffDispatchOperator(email)) {
      throw new ForbiddenException(
        'Payout dispatch is restricted to the designated staff account',
      );
    }
  }

  private async fetchEligiblePayouts(payoutIds?: string[]) {
    const baseWhere = {
      status: 'PENDING' as const,
      source: 'DEPOSITOR' as const,
      walletAddress: { not: null },
      OR: [
        { payoutMethod: null },
        { payoutMethod: { not: PayoutMethod.MOBILE_MONEY } },
      ],
      scheduledApproveAt: null,
      momoP2p: { is: null },
    };

    const payouts = payoutIds?.length
      ? await this.prisma.payout.findMany({
          where: { ...baseWhere, id: { in: payoutIds } },
          include: {
            user: {
              select: { displayName: true, email: true },
            },
          },
        })
      : await this.prisma.payout.findMany({
          where: baseWhere,
          include: {
            user: {
              select: { displayName: true, email: true },
            },
          },
        });

    if (payoutIds?.length && payouts.length !== payoutIds.length) {
      const found = new Set(payouts.map((p) => p.id));
      const missing = payoutIds.filter((id) => !found.has(id));
      throw new BadRequestException(
        `Some payouts are not eligible or not found: ${missing.join(', ')}`,
      );
    }

    return payouts.sort(
      (a, b) => Number(a.traderShare) - Number(b.traderShare),
    );
  }

  private resolveFirstSlot(startAt?: string): Date {
    if (startAt?.trim()) {
      const parsed = new Date(startAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid startAt date');
      }
      return parsed;
    }
    return new Date(Date.now() + STAFF_DISPATCH_INTERVAL_MS);
  }

  buildPreview(payouts: Awaited<ReturnType<typeof this.fetchEligiblePayouts>>, firstAt: Date): StaffDispatchRow[] {
    const slots = buildDispatchSchedule(payouts.length, firstAt);
    return payouts.map((p, index) => ({
      position: index + 1,
      payoutId: p.id,
      displayName: p.user.displayName,
      email: p.user.email,
      amount: Number(p.traderShare),
      walletAddress: p.walletAddress!,
      scheduledAt: slots[index].toISOString(),
      scheduledAtEat: formatKampalaDateTime(slots[index]),
    }));
  }

  async preview(operatorEmail: string | null | undefined, payoutIds?: string[], startAt?: string) {
    this.assertOperator(operatorEmail);
    const payouts = await this.fetchEligiblePayouts(payoutIds);
    const firstAt = this.resolveFirstSlot(startAt);
    const schedule = this.buildPreview(payouts, firstAt);

    return {
      intervalHours: STAFF_DISPATCH_INTERVAL_MS / (60 * 60 * 1000),
      order: 'low_to_high_amount' as const,
      firstAt: firstAt.toISOString(),
      firstAtEat: formatKampalaDateTime(firstAt),
      count: schedule.length,
      totalAmount: schedule.reduce((sum, row) => sum + row.amount, 0),
      schedule,
    };
  }

  async create(
    operatorEmail: string | null | undefined,
    operatorId: string,
    payoutIds?: string[],
    startAt?: string,
  ) {
    this.assertOperator(operatorEmail);
    const payouts = await this.fetchEligiblePayouts(payoutIds);
    if (payouts.length === 0) {
      throw new BadRequestException(
        'No eligible pending wallet withdrawals to dispatch',
      );
    }

    const firstAt = this.resolveFirstSlot(startAt);
    const slots = buildDispatchSchedule(payouts.length, firstAt);
    const schedule = this.buildPreview(payouts, firstAt);

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < payouts.length; i++) {
        const p = payouts[i];
        const scheduledAt = slots[i];
        const note = `Staff dispatch ${formatKampalaDateTime(scheduledAt)} EAT — position ${i + 1}/${payouts.length}, 2h interval, low→high order (by ${operatorId})`;
        const notes = [stripPriorStaffDispatchNotes(p.notes), note]
          .filter(Boolean)
          .join(' — ')
          .trim();

        await tx.payout.update({
          where: { id: p.id },
          data: {
            scheduledApproveAt: scheduledAt,
            notes,
          },
        });
      }

      await tx.platformConfig.update({
        where: { id: 'default' },
        data: {
          sundayWithdrawBatchAnchor: firstAt,
          sundayWithdrawBatchFinalizedAt: null,
          sundayWithdrawBatchScheduleNotifiedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: operatorId,
          action: 'STAFF_DISPATCH_CREATED',
          targetId: payouts[0]?.id ?? null,
          metadata: {
            payoutIds: payouts.map((p) => p.id),
            count: payouts.length,
            firstAt: firstAt.toISOString(),
            intervalHours: 2,
            order: 'low_to_high_amount',
          },
        },
      });
    });

    return {
      message: `Dispatch created — ${payouts.length} payout(s), 2h apart, low→high amount`,
      intervalHours: 2,
      order: 'low_to_high_amount' as const,
      firstAt: firstAt.toISOString(),
      count: schedule.length,
      totalAmount: schedule.reduce((sum, row) => sum + row.amount, 0),
      schedule,
    };
  }
}
