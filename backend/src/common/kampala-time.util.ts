import { randomInt } from 'crypto';

/** Calendar date in Africa/Kampala as UTC midnight (matches investor creditDate storage). */
export function kampalaCalendarDate(date: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Current hour and minute in Africa/Kampala. */
export function kampalaHourMinute(date: Date = new Date()): {
  hour: number;
  minute: number;
} {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}

/** Minutes since midnight in Africa/Kampala. */
export function kampalaMinutesSinceMidnight(date: Date = new Date()): number {
  const { hour, minute } = kampalaHourMinute(date);
  return hour * 60 + minute;
}

export function formatKampalaDateLabel(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatKampalaTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Smart Invest yield delivery window — random minute each Kampala weekday. */
export const INVESTOR_YIELD_DELIVERY_START_MINUTE = 13 * 60; // 13:00
export const INVESTOR_YIELD_DELIVERY_END_MINUTE = 18 * 60 + 59; // 18:59

export function pickRandomInvestorYieldDeliveryMinute(): number {
  return randomInt(
    INVESTOR_YIELD_DELIVERY_START_MINUTE,
    INVESTOR_YIELD_DELIVERY_END_MINUTE + 1,
  );
}

export function investorYieldDeliveryWindowLabel(): string {
  const start = formatKampalaTime(
    Math.floor(INVESTOR_YIELD_DELIVERY_START_MINUTE / 60),
    INVESTOR_YIELD_DELIVERY_START_MINUTE % 60,
  );
  const end = formatKampalaTime(
    Math.floor(INVESTOR_YIELD_DELIVERY_END_MINUTE / 60),
    INVESTOR_YIELD_DELIVERY_END_MINUTE % 60,
  );
  return `${start}–${end} Africa/Kampala (weekdays)`;
}
