/** Sunday wallet-withdraw auto-batch helpers. */

export const SUNDAY_BATCH_CRON_ACTOR = 'cron_sunday_withdraw_batch';
export const SUNDAY_BATCH_ADJUSTMENT_PERCENT = 9;
export const SUNDAY_BATCH_HOUR_MS = 60 * 60 * 1000;

export function isSundayUtc(date = new Date()): boolean {
  return date.getUTCDay() === 0;
}

/** Start of the current Sunday 00:00:00.000 UTC. */
export function sundayUtcStart(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** End of the current Sunday 23:59:59.999 UTC. */
export function sundayUtcEnd(date = new Date()): Date {
  const start = sundayUtcStart(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function isSameSundayUtc(a: Date, b: Date): boolean {
  return sundayUtcStart(a).getTime() === sundayUtcStart(b).getTime();
}

/** Round up to the next whole hour (UTC). */
export function nextUtcHour(from = new Date()): Date {
  const d = new Date(from);
  d.setUTCMinutes(0, 0, 0);
  if (d.getTime() <= from.getTime()) {
    d.setUTCHours(d.getUTCHours() + 1);
  }
  return d;
}

export function formatKampalaDateTime(date: Date): string {
  return date.toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function applySundayBatchAdjustment(netPayout: number): {
  adjustedNet: number;
  reduction: number;
} {
  const adjustedNet =
    Math.round(netPayout * (1 - SUNDAY_BATCH_ADJUSTMENT_PERCENT / 100) * 100) /
    100;
  const reduction = Math.round((netPayout - adjustedNet) * 100) / 100;
  return { adjustedNet, reduction };
}
