"use client";

import { formatMoney, formatUsdtHint, type DisplayCurrency } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

type WalletBalanceCardProps = {
  balance: number;
  reserveBalance?: number;
  displayCurrency?: DisplayCurrency | null;
  savedWalletCount?: number;
  onWithdraw: () => void;
  onDeposit: () => void;
  onTransfer: () => void;
  onManageWallets: () => void;
  withdrawClosed?: boolean;
  withdrawClosedMessage?: string | null;
};

export function WalletBalanceCard({
  balance,
  reserveBalance = 0,
  displayCurrency,
  savedWalletCount = 0,
  onWithdraw,
  onDeposit,
  onTransfer,
  onManageWallets,
  withdrawClosed = false,
  withdrawClosedMessage,
}: WalletBalanceCardProps) {
  const usdtHint = formatUsdtHint(balance, displayCurrency);
  const badge =
    displayCurrency?.source === "coinbase" && displayCurrency.code !== "USDT"
      ? displayCurrency.code
      : "USDT";

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="relative w-full overflow-hidden rounded-[1.75rem] border border-cyan-300/20 bg-gradient-to-br from-[#0e7490] via-[#1d4ed8] to-[#064e3b] p-5 shadow-xl shadow-cyan-950/40 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-300/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute right-10 top-1/2 h-px w-40 rotate-[-18deg] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">
            Available
            <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[10px] tracking-normal text-white/80">
              {badge}
            </span>
          </p>
          <p className="mt-3 break-words text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {formatMoney(balance, displayCurrency)}
          </p>
          {usdtHint ? (
            <p className="mt-1.5 text-sm text-white/55">{usdtHint}</p>
          ) : null}
        </div>

        <div className="relative mt-6 grid w-full grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onDeposit}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-[#0c2d57] shadow-lg transition hover:bg-cyan-50 active:scale-[0.98]"
          >
            <ArrowDownLeft className="h-4 w-4 shrink-0" />
            Deposit
          </button>
          <button
            type="button"
            onClick={onWithdraw}
            disabled={withdrawClosed}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#04121f]/60 py-3.5 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-[#04121f]/85 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowUpRight className="h-4 w-4 shrink-0" />
            Withdraw
          </button>
          <button
            type="button"
            onClick={onTransfer}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
          >
            <ArrowLeftRight className="h-4 w-4 shrink-0" />
            Transfer
          </button>
          <button
            type="button"
            onClick={onManageWallets}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
          >
            <WalletCards className="h-4 w-4 shrink-0" />
            {savedWalletCount > 0
              ? `Wallets (${savedWalletCount})`
              : "Add wallet"}
          </button>
          <Link
            href="/wallet/auto-withdraw"
            className="col-span-2 flex w-full items-center justify-center rounded-2xl py-2.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Auto-withdraw settings →
          </Link>
        </div>
        {withdrawClosed && withdrawClosedMessage ? (
          <p className="relative mt-3 text-sm leading-relaxed text-white/75">
            {withdrawClosedMessage}
          </p>
        ) : null}
      </section>

      {reserveBalance > 0 ? (
        <section className="w-full rounded-3xl border border-white/10 bg-[#0b1528] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
            Reserve
          </p>
          <p className="mt-3 break-words text-3xl font-bold tabular-nums tracking-tight text-white">
            {formatMoney(reserveBalance, displayCurrency)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            Wallet funds that are not in investment, including September
            withdrawals that were not approved. This is paid into Available
            slowly as the platform recovers. Reserve cannot be withdrawn until
            it is released.
          </p>
        </section>
      ) : null}
    </div>
  );
}
