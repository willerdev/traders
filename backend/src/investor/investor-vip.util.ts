export const INVESTOR_VIP_FEE_USDT = 20;
export const INVESTOR_VIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const INVESTOR_VIP_REMINDER_DAYS = 3;

export function isInvestorVipActive(user: {
  investorVipActive?: boolean | null;
  investorVipExpiresAt?: Date | string | null;
}): boolean {
  if (!user.investorVipActive || !user.investorVipExpiresAt) return false;
  const expires =
    user.investorVipExpiresAt instanceof Date
      ? user.investorVipExpiresAt
      : new Date(user.investorVipExpiresAt);
  return Number.isFinite(expires.getTime()) && expires.getTime() > Date.now();
}

/** Extend from max(now, currentExpiry) by one VIP period. */
export function nextVipExpiry(currentExpiresAt?: Date | null): Date {
  const now = Date.now();
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > now
      ? currentExpiresAt.getTime()
      : now;
  return new Date(base + INVESTOR_VIP_DURATION_MS);
}
