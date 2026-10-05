"use client";

import { formatMoney, formatUsdtHint, type DisplayCurrency } from "@/lib/utils";
import { ArrowUpRight, WalletCards } from "lucide-react";

type WalletBalanceCardProps = {
  balance: number;
  displayCurrency?: DisplayCurrency | null;
  savedWalletCount?: number;
  onWithdraw: () => void;
  onManageWallets: () => void;
  withdrawDisabled?: boolean;
  withdrawDisabledLabel?: string;
};

export function WalletBalanceCard({
  balance,
  displayCurrency,
  savedWalletCount = 0,
  onWithdraw,
  onManageWallets,
  withdrawDisabled = false,
  withdrawDisabledLabel = "Balance in use",
}: WalletBalanceCardProps) {
  const usdtHint = formatUsdtHint(balance, displayCurrency);
  const badge =
    displayCurrency?.source === "coinbase" && displayCurrency.code !== "USDT"
      ? displayCurrency.code
      : "USDT";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a4dff] via-[#1d4ed8] to-[#0b1b3a] p-6 shadow-xl shadow-primary/15 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-black/30 blur-3xl" />

      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">
          Live remaining
          <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[10px] tracking-normal text-white/80">
            {badge}
          </span>
        </p>
        <p className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {formatMoney(balance, displayCurrency)}
        </p>
        {usdtHint && (
          <p className="mt-1.5 text-sm text-white/55">{usdtHint}</p>
        )}
        <p className="mt-1.5 text-xs text-white/50">
          Same remaining as Trading — moves with open trades
        </p>
      </div>

      <div className="relative mt-8 grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={onWithdraw}
          disabled={withdrawDisabled}
          className="flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-[#0b1528]/55 py-3.5 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-[#0b1528]/80 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#0b1528]/55"
        >
          <span className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Withdraw
          </span>
          {withdrawDisabled ? (
            <span className="text-[11px] font-medium text-white/70">
              {withdrawDisabledLabel}
            </span>
          ) : null}
        </button>
      </div>

      <button
        type="button"
        onClick={onManageWallets}
        className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <WalletCards className="h-4 w-4" />
        {savedWalletCount > 0
          ? `Saved wallets (${savedWalletCount})`
          : "Add a withdrawal wallet"}
      </button>
    </div>
  );
}
