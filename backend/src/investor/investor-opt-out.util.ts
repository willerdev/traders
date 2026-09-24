import { addKampalaWeekdays } from '../common/kampala-weekend.util';
import { getWeekNumber } from '../common/week.util';

export const INVESTOR_MAINTENANCE_DAYS = 14;
export const INVESTOR_WEEKLY_PROFIT_FRACTION = 0.2;
export const WITHDRAW_40_BY_SATURDAY_LABEL = 'Saturday 26 September 2026';

export const OPT_OUT_REASON_CODES = [
  'LIQUIDITY',
  'TIMING',
  'RETURNS',
  'MAINTENANCE',
  'OTHER',
] as const;

export type OptOutReasonCode = (typeof OPT_OUT_REASON_CODES)[number];

export const OPT_OUT_REASON_OPTIONS: Array<{
  code: OptOutReasonCode;
  label: string;
}> = [
  { code: 'LIQUIDITY', label: 'I need the capital for personal use' },
  { code: 'TIMING', label: 'Unhappy with current withdrawal timing' },
  { code: 'RETURNS', label: 'Returns have not met my expectations' },
  { code: 'MAINTENANCE', label: 'I prefer to pause during system maintenance' },
  { code: 'OTHER', label: 'Other' },
];

export const OPT_OUT_POLICY = {
  title: 'Redeem Smart Invest',
  businessDays: 5,
  day3Report: 3,
  bullets: [
    'Redeeming Smart Invest takes 5 consecutive business days (Monday–Friday). Weekends do not count.',
    'Your invested capital is returned to your wallet on business day 5. Capital is protected.',
    'Full profits are not guaranteed. Yield already credited to your wallet stays there. Future daily yield and any unsettled Smart Invest trading P&L are not paid during the cooling period.',
    'On business day 3 you receive a written report: capital to refund, profits already received, and profits you will not receive.',
    'You cannot move funds between wallet and Smart Invest while a redeem is in progress.',
  ],
};

export function isOptOutReasonCode(value: string): value is OptOutReasonCode {
  return (OPT_OUT_REASON_CODES as readonly string[]).includes(value);
}

export function optOutReasonLabel(
  code: string,
  note?: string | null,
): string {
  const row = OPT_OUT_REASON_OPTIONS.find((r) => r.code === code);
  const label = row?.label ?? code;
  const extra = note?.trim();
  if (!extra) return label;
  return code === 'OTHER' ? `${label}: ${extra}` : `${label} — ${extra}`;
}

export function maskInvestorEmail(
  email: string | null | undefined,
): string | null {
  if (!email?.includes('@')) return null;
  const [local, domain] = email.split('@');
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}***@${domain}`;
}

export function optOutSchedule(from = new Date()) {
  return {
    day3At: addKampalaWeekdays(from, 3),
    settleAt: addKampalaWeekdays(from, 5),
  };
}

export function maintenanceUntilFrom(from = new Date()) {
  return new Date(from.getTime() + INVESTOR_MAINTENANCE_DAYS * 24 * 60 * 60 * 1000);
}

export function kampalaIsoWeekKey(date = new Date()) {
  const week = getWeekNumber(date);
  const year = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
  }).format(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function roundUsdt(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function formatKampalaWhen(date: Date) {
  return date.toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
