/**
 * Soloema wallet withdraw pause (members) vs operator profit withdraw.
 * Set `SOLO_WALLET_WITHDRAW_ENABLED` to `true` to turn withdraw on for everyone.
 */
export const SOLO_WALLET_WITHDRAW_ENABLED = false;

export const SOLO_WALLET_WITHDRAW_PAUSED_LABEL = 'Balance in use';

export function isSoloWalletWithdrawEnabledForUser(user: {
  soloTradeOperator?: boolean | null;
}): boolean {
  if (SOLO_WALLET_WITHDRAW_ENABLED) return true;
  return Boolean(user.soloTradeOperator);
}
