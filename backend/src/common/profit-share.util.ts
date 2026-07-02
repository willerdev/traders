import {
  PROFIT_SHARE_FEE_USDT,
  PROFIT_SHARE_PERCENT,
  PROFIT_SHARE_WITHDRAW_THRESHOLD_PERCENT,
  STARTING_BALANCE,
} from './constants';

export type ProfitShareConfig = {
  feeUsdt: number;
  sharePercent: number;
  withdrawThresholdPercent: number;
  startingBalance: number;
};

export function resolveProfitShareConfig(
  platform?: {
    profitShareFeeUsdt?: { toString(): string } | null;
    profitSharePercent?: { toString(): string } | null;
    profitShareWithdrawThresholdPercent?: { toString(): string } | null;
    startingBalance?: { toString(): string } | null;
  } | null,
): ProfitShareConfig {
  return {
    feeUsdt: Number(platform?.profitShareFeeUsdt ?? PROFIT_SHARE_FEE_USDT),
    sharePercent: Number(platform?.profitSharePercent ?? PROFIT_SHARE_PERCENT),
    withdrawThresholdPercent: Number(
      platform?.profitShareWithdrawThresholdPercent ??
        PROFIT_SHARE_WITHDRAW_THRESHOLD_PERCENT,
    ),
    startingBalance: Number(platform?.startingBalance ?? STARTING_BALANCE),
  };
}

export function profitShareTraderAmount(
  grossProfit: number,
  sharePercent: number,
): number {
  if (grossProfit <= 0) return 0;
  return Math.round(grossProfit * (sharePercent / 100) * 100) / 100;
}

export function profitShareWithdrawThreshold(
  config: ProfitShareConfig,
  accountBalance?: number | null,
): number {
  const basis = accountBalance ?? config.startingBalance;
  return (
    Math.round(basis * (config.withdrawThresholdPercent / 100) * 100) / 100
  );
}
