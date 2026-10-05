import { kampalaDayOfWeek } from '../common/kampala-weekend.util';

/** Temporary Trade Guard withdrawal days (Africa/Kampala weekday, 0 = Sunday). */
export const WITHDRAW_DAYS = {
  enabled: true,
  weekdays: [3, 6] as readonly number[],
  label: 'Wednesday and Saturday',
  userMessage:
    'Withdrawals are temporarily open on Wednesdays and Saturdays only. Please come back on the next withdrawal day.',
} as const;

export function isWithdrawDayGateActive(): boolean {
  return WITHDRAW_DAYS.enabled;
}

export function isWithdrawDayOpen(now: Date = new Date()): boolean {
  if (!isWithdrawDayGateActive()) return true;
  return WITHDRAW_DAYS.weekdays.includes(kampalaDayOfWeek(now));
}

/** Start of the next open withdrawal day (Kampala midnight = 21:00 UTC prior day). */
export function nextWithdrawDayAt(now: Date = new Date()): Date {
  if (isWithdrawDayOpen(now)) return new Date(now);
  const dow = kampalaDayOfWeek(now);
  let add = 1;
  while (!WITHDRAW_DAYS.weekdays.includes((dow + add) % 7)) add++;
  const kampala = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      kampala.getUTCFullYear(),
      kampala.getUTCMonth(),
      kampala.getUTCDate() + add,
    ) -
      3 * 60 * 60 * 1000,
  );
}

/** Temporary Trade Guard withdrawal limits during platform maintenance. */
export const WITHDRAW_MAINTENANCE = {
  enabled: true,
  maxFraction: 0.4,
  feesWaived: true,
  cancelDisabled: true,
  userMessage:
    'Due to ongoing system maintenance, withdrawals are temporarily limited to 40% of your available wallet balance. Withdrawal fees are waived, and cancelling a pending withdrawal is temporarily disabled. This is temporary and is being fixed.',
} as const;

export function isWithdrawMaintenanceActive(): boolean {
  return WITHDRAW_MAINTENANCE.enabled;
}

export function maxMaintenanceWithdrawUsdt(availableBalance: number): number {
  const available = Math.max(0, Number(availableBalance) || 0);
  if (!isWithdrawMaintenanceActive()) {
    return Math.round(available * 100) / 100;
  }
  return (
    Math.round(available * WITHDRAW_MAINTENANCE.maxFraction * 100) / 100
  );
}
