"use client";

import { formatCurrency } from "@/lib/utils";

export const WALLET_WITHDRAWAL_FEE_USD = 3;

export function walletWithdrawNetAmount(gross: string | number): number | null {
  const n = typeof gross === "number" ? gross : Number(gross);
  if (!Number.isFinite(n) || n <= WALLET_WITHDRAWAL_FEE_USD) return null;
  return Math.round((n - WALLET_WITHDRAWAL_FEE_USD) * 100) / 100;
}

export function WalletWithdrawFeeNotice({
  amount,
  className = "",
}: {
  amount?: string | number;
  className?: string;
}) {
  const gross =
    amount != null && amount !== ""
      ? typeof amount === "number"
        ? amount
        : Number(amount)
      : null;
  const net =
    gross != null && Number.isFinite(gross)
      ? walletWithdrawNetAmount(gross)
      : null;

  return (
    <p
      className={`rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-gray-400 ${className}`}
    >
      A {formatCurrency(WALLET_WITHDRAWAL_FEE_USD)} processing fee applies to
      every withdrawal.
      {net != null && net > 0 ? (
        <>
          {" "}
          You will receive{" "}
          <strong className="text-gray-300">{formatCurrency(net)}</strong> on
          your wallet ({formatCurrency(gross!)} −{" "}
          {formatCurrency(WALLET_WITHDRAWAL_FEE_USD)} fee).
        </>
      ) : gross != null && Number.isFinite(gross) && gross > 0 ? (
        <>
          {" "}
          Minimum withdrawal is{" "}
          {formatCurrency(WALLET_WITHDRAWAL_FEE_USD + 0.01)}.
        </>
      ) : (
        <> The amount sent on-chain is your withdrawal minus {formatCurrency(WALLET_WITHDRAWAL_FEE_USD)}.</>
      )}
    </p>
  );
}
