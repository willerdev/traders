/**
 * Soloema wallet withdraw pause (members) vs operator profit withdraw.
 */
export const SOLO_WALLET_WITHDRAW_ENABLED = false;

export const SOLO_WALLET_WITHDRAW_PAUSED_LABEL = "Balance in use";

export function isSoloWalletWithdrawEnabled(summary?: {
  soloWithdrawEnabled?: boolean;
  soloTradeOperator?: boolean;
} | null): boolean {
  if (SOLO_WALLET_WITHDRAW_ENABLED) return true;
  return Boolean(summary?.soloWithdrawEnabled ?? summary?.soloTradeOperator);
}
