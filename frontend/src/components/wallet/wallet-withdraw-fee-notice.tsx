"use client";

import { formatCurrency } from "@/lib/utils";

export const WALLET_WITHDRAWAL_FEE_USD = 3;

export function walletWithdrawNetAmount(
  gross: string | number,
  feeUsdt = WALLET_WITHDRAWAL_FEE_USD,
): number | null {
  const n = typeof gross === "number" ? gross : Number(gross);
  if (!Number.isFinite(n)) return null;
  if (feeUsdt > 0 && n <= feeUsdt) return null;
  return Math.round((n - feeUsdt) * 100) / 100;
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
  const net =
    gross != null && Number.isFinite(gross)
      ? walletWithdrawNetAmount(gross, fee)
      : null;

  if (fee <= 0) {
    return (
      <p
        className={`rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-200 ${className}`}
      >
        VIP benefit: <strong>$0</strong> withdrawal fee — you receive the full
        amount.
        {net != null && net > 0 ? (
          <>
            {" "}
            Payout: <strong className="text-emerald-100">{formatCurrency(net)}</strong>.
          </>
        ) : null}
      </p>
    );
  }

  return (
    <p
      className={`rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-gray-400 ${className}`}
    >
      A {formatCurrency(fee)} processing fee applies to every withdrawal.
      {net != null && net > 0 ? (
        <>
          {" "}
          You will receive{" "}
          <strong className="text-gray-300">{formatCurrency(net)}</strong> on
          your wallet ({formatCurrency(gross!)} − {formatCurrency(fee)} fee).
        </>
      ) : gross != null && Number.isFinite(gross) && gross > 0 ? (
        <>
          {" "}
          Minimum withdrawal is {formatCurrency(fee + 0.01)}.
        </>
      ) : (
        <>
          {" "}
          The amount sent on-chain is your withdrawal minus{" "}
          {formatCurrency(fee)}.
        </>
      )}
    </p>
  );
}
