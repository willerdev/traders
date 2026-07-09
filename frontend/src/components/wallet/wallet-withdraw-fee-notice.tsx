"use client";

const WITHDRAW_FEE_WARNING_THRESHOLD = 50;
const WITHDRAW_NETWORK_FEE_USD = 5;

export function shouldShowWithdrawFeeNotice(amount: string | number): boolean {
  const n = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(n) && n > 0 && n < WITHDRAW_FEE_WARNING_THRESHOLD;
}

export function WalletWithdrawFeeNotice({
  amount,
  className = "",
}: {
  amount?: string | number;
  className?: string;
}) {
  if (amount != null && !shouldShowWithdrawFeeNotice(amount)) {
    return null;
  }

  return (
    <p
      className={`rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-gray-400 ${className}`}
    >
      Withdrawals under ${WITHDRAW_FEE_WARNING_THRESHOLD} may incur about $
      {WITHDRAW_NETWORK_FEE_USD} in network fees from our payout provider — you
      may receive less than the amount sent on small withdrawals.
    </p>
  );
}
