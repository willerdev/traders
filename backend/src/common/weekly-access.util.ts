export const WEEKLY_ACCESS_MS = 7 * 24 * 60 * 60 * 1000;

export function computeWeeklyAccessExpiry(
  now: Date,
  currentExpiry?: Date | null,
): Date {
  const base =
    currentExpiry && currentExpiry.getTime() > now.getTime()
      ? currentExpiry
      : now;
  return new Date(base.getTime() + WEEKLY_ACCESS_MS);
}

export function hasActiveTradingAccess(user: {
  role?: string;
  status: string;
  accessExpiresAt?: Date | string | null;
}): boolean {
  if (user.role === 'ADMIN') return true;
  if (user.status !== 'ACTIVE') return false;
  if (!user.accessExpiresAt) return false;
  const expiry =
    user.accessExpiresAt instanceof Date
      ? user.accessExpiresAt
      : new Date(user.accessExpiresAt);
  return expiry.getTime() > Date.now();
}

export function tradingAccessDaysRemaining(
  accessExpiresAt?: Date | string | null,
): number | null {
  if (!accessExpiresAt) return null;
  const expiry =
    accessExpiresAt instanceof Date
      ? accessExpiresAt
      : new Date(accessExpiresAt);
  const ms = expiry.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
