/** Minimum Smart Invest balance required to earn daily yield once the policy is in force. */
export const INVESTOR_MIN_BALANCE_USDT = 750;

/** UTC calendar date when under-minimum investments stop earning (inclusive). */
export const INVESTOR_MIN_BALANCE_EFFECTIVE_DATE = '2026-08-05';

export function investorMinBalanceEffectiveAt(): Date {
  return new Date(`${INVESTOR_MIN_BALANCE_EFFECTIVE_DATE}T00:00:00.000Z`);
}

/** True when the policy's calendar date has been reached (UTC). */
export function isInvestorMinBalanceDateReached(now = new Date()): boolean {
  return now.getTime() >= investorMinBalanceEffectiveAt().getTime();
}

/**
 * Whether this investor should be blocked from daily yield by the min-balance rule.
 * Global enforce flag + effective date + balance check; per-user exempt wins.
 */
export function isBlockedByInvestorMinBalance(opts: {
  enforced: boolean;
  balanceUsdt: number;
  exempt?: boolean;
  now?: Date;
}): boolean {
  if (!opts.enforced) return false;
  if (opts.exempt) return false;
  if (!isInvestorMinBalanceDateReached(opts.now)) return false;
  return Number(opts.balanceUsdt) > 0 && Number(opts.balanceUsdt) < INVESTOR_MIN_BALANCE_USDT;
}
