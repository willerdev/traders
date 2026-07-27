"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

export const WALLET_WITHDRAWAL_FEE_USD = 3;

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
  const enabled = schedule?.scheduleEnabled !== false;
  const inWindow = schedule?.inPreferredWindow !== false;
  const penaltyPercent =
    enabled && !inWindow
      ? Math.max(0, Number(schedule?.offSchedulePenaltyPercent ?? 8))
      : 0;
  const penaltyUsdt =
    Math.round(((gross * penaltyPercent) / 100) * 100) / 100;
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
  schedule,
  className = "",
}: {
  amount?: string | number;
  feeUsdt?: number;
  schedule?: WithdrawalScheduleInfo | null;
  className?: string;
}) {
  const fee = feeUsdt ?? WALLET_WITHDRAWAL_FEE_USD;
  const scheduleEnabled = schedule?.scheduleEnabled !== false;
  const windowLabel =
    schedule?.preferredWindowLabel ??
    (String(schedule?.preferredSchedule).toUpperCase() === "MONTHLY"
      ? "the 1st of each month (UTC)"
      : "Sundays (UTC)");
  const inWindow = schedule?.inPreferredWindow !== false;
  const penaltyPercent = Number(schedule?.offSchedulePenaltyPercent ?? 8);
  const gross =
    amount != null && amount !== ""
      ? typeof amount === "number"
        ? amount
        : Number(amount)
      : null;
  const quote =
    gross != null && Number.isFinite(gross)
      ? estimateWithdrawalFees(gross, fee, schedule)
      : null;
  const net = quote && quote.netPayoutUsdt > 0 ? quote.netPayoutUsdt : null;
  const nextAt = schedule?.nextPreferredWindowAt
    ? new Date(schedule.nextPreferredWindowAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      })
    : null;

  return (
    <div
      className={`space-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-gray-400 ${className}`}
    >
      {scheduleEnabled ? (
        <p>
          Preferred withdrawals:{" "}
          <strong className="text-gray-300">{windowLabel}</strong>
          {inWindow ? (
            <>
              {" "}
              — <span className="text-emerald-300">you are in-window</span> (no
              off-schedule penalty).
            </>
          ) : (
            <>
              {" "}
              — <span className="text-amber-300">off-schedule</span>
              {penaltyPercent > 0 ? (
                <>
                  {" "}
                  (+{penaltyPercent}% penalty on gross)
                </>
              ) : null}
              {nextAt ? <> · next window {nextAt} UTC</> : null}.
            </>
          )}{" "}
          <Link href="/terms#withdrawals" className="text-primary hover:underline">
            Terms
          </Link>
        </p>
      ) : null}

      {fee <= 0 && !(quote?.penaltyUsdt) ? (
        <p className="text-emerald-200">
          VIP benefit: <strong>$0</strong> processing fee
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
          {quote && quote.penaltyUsdt > 0 ? (
            <>
              {" "}
              + off-schedule penalty {formatCurrency(quote.penaltyUsdt)}
            </>
          ) : null}
          {net != null && gross != null ? (
            <>
              {" "}
              → you receive{" "}
              <strong className="text-gray-300">{formatCurrency(net)}</strong>{" "}
              ({formatCurrency(gross)} − {formatCurrency(quote!.totalFeesUsdt)}).
            </>
          ) : gross != null && Number.isFinite(gross) && gross > 0 && quote ? (
            <>
              {" "}
              Minimum withdrawal is{" "}
              {formatCurrency(quote.totalFeesUsdt + 0.01)}.
            </>
          ) : (
            <>
              {" "}
              Anytime withdrawals work; withdrawing outside the preferred window
              adds the penalty above.
            </>
          )}
        </p>
      )}
    </div>
  );
}
