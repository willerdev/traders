"use client";

import { formatCurrency } from "@/lib/utils";

export const WALLET_WITHDRAWAL_FEE_USD = 0;

export type WithdrawalScheduleInfo = {
  scheduleEnabled?: boolean;
  preferredSchedule?: "WEEKLY" | "MONTHLY" | string;
  offSchedulePenaltyPercent?: number;
  inPreferredWindow?: boolean;
  preferredWindowLabel?: string;
  nextPreferredWindowAt?: string;
};

export function estimateWithdrawalFees(
  gross: number,
  processingFeeUsdt: number,
  schedule?: WithdrawalScheduleInfo | null,
): {
  processingFeeUsdt: number;
  penaltyUsdt: number;
  totalFeesUsdt: number;
  netPayoutUsdt: number;
  offSchedule: boolean;
} {
  const processing = Math.max(0, processingFeeUsdt);
  const enabled = schedule?.scheduleEnabled === true;
  const inWindow = schedule?.inPreferredWindow === true;
  const penaltyPercent = Math.max(0, Number(schedule?.offSchedulePenaltyPercent ?? 0));
  const penaltyUsdt =
    enabled && !inWindow && penaltyPercent > 0
      ? Math.round(((gross * penaltyPercent) / 100) * 100) / 100
      : 0;
  const totalFeesUsdt = Math.round((processing + penaltyUsdt) * 100) / 100;
  const netPayoutUsdt = Math.round((gross - totalFeesUsdt) * 100) / 100;
  return {
    processingFeeUsdt: processing,
    penaltyUsdt,
    totalFeesUsdt,
    netPayoutUsdt,
    offSchedule: penaltyUsdt > 0,
  };
}

export function walletWithdrawNetAmount(
  gross: string | number,
  feeUsdt = WALLET_WITHDRAWAL_FEE_USD,
  schedule?: WithdrawalScheduleInfo | null,
): number | null {
  const n = typeof gross === "number" ? gross : Number(gross);
  if (!Number.isFinite(n)) return null;
  const quote = estimateWithdrawalFees(n, feeUsdt, schedule);
  if (quote.totalFeesUsdt > 0 && n <= quote.totalFeesUsdt) return null;
  if (quote.netPayoutUsdt <= 0) return null;
  return quote.netPayoutUsdt;
}

export function WalletWithdrawFeeNotice({
  amount,
  feeUsdt = WALLET_WITHDRAWAL_FEE_USD,
  className = "",
}: {
  amount?: string | number;
  feeUsdt?: number;
  className?: string;
}) {
  const fee = feeUsdt ?? WALLET_WITHDRAWAL_FEE_USD;
  const gross =
    amount != null && amount !== ""
      ? typeof amount === "number"
        ? amount
        : Number(amount)
      : null;
  const quote =
    gross != null && Number.isFinite(gross)
      ? estimateWithdrawalFees(gross, fee, null)
      : null;
  const net = quote && quote.netPayoutUsdt > 0 ? quote.netPayoutUsdt : null;

  return (
    <div
      className={`rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-gray-400 ${className}`}
    >
      {fee <= 0 ? (
        <p className="text-emerald-200">
          $0 processing fee
          {net != null ? (
            <>
              {" "}
              — payout{" "}
              <strong className="text-emerald-100">{formatCurrency(net)}</strong>
            </>
          ) : null}
          .
        </p>
      ) : (
        <p>
          Processing fee: {formatCurrency(fee)}
          {net != null && gross != null ? (
            <>
              {" "}
              → you receive{" "}
              <strong className="text-gray-300">{formatCurrency(net)}</strong>
            </>
          ) : gross != null && Number.isFinite(gross) && gross > 0 && quote ? (
            <>
              {" "}
              Minimum withdrawal is {formatCurrency(quote.totalFeesUsdt + 0.01)}.
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
