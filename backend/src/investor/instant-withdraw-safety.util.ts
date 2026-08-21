import { isInvestorVvipActive } from './investor-vvip.util';

/** Temporary safety net — disable auto instant send; require hold before any approval. */
export const INSTANT_WITHDRAW_SAFETY_HOLD_ENABLED = true;

/** 72-hour hold on instant-tier (whitelist + VVIP) wallet withdrawals before approval. */
export const INSTANT_WITHDRAW_SAFETY_HOLD_MS = 72 * 60 * 60 * 1000;

export function isInstantTierWithdrawUser(user: {
  instantWithdraw?: boolean | null;
  investorVvipActive?: boolean | null;
} | null): boolean {
  if (!user) return false;
  return Boolean(user.instantWithdraw) || isInvestorVvipActive(user);
}

export function instantWithdrawSafetyHoldRemainingMs(
  requestedAt: Date,
): number {
  if (!INSTANT_WITHDRAW_SAFETY_HOLD_ENABLED) return 0;
  const elapsed = Date.now() - requestedAt.getTime();
  return Math.max(0, INSTANT_WITHDRAW_SAFETY_HOLD_MS - elapsed);
}
