import { PayoutStatus } from '@prisma/client';

/** September 2026 UTC — only unapproved withdrawals from this window go to Reserve. */
export const WITHDRAWAL_RESERVE_FROM = new Date('2026-09-01T00:00:00.000Z');
export const WITHDRAWAL_RESERVE_TO = new Date('2026-10-01T00:00:00.000Z');

export const UNAPPROVED_RESERVE_STATUSES: PayoutStatus[] = [
  'PENDING',
  'REJECTED',
];

export function roundReserveUsdt(n: number) {
  return Math.round(n * 100) / 100;
}

export const SEPTEMBER_UNAPPROVED_PAYOUT_WHERE = {
  requestedAt: {
    gte: WITHDRAWAL_RESERVE_FROM,
    lt: WITHDRAWAL_RESERVE_TO,
  },
  status: { in: UNAPPROVED_RESERVE_STATUSES },
} as const;
