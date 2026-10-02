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
}: WalletBalanceCardProps) {
  const usdtHint = formatUsdtHint(balance, displayCurrency);
  const badge =
    displayCurrency?.source === "coinbase" && displayCurrency.code !== "USDT"
      ? displayCurrency.code
      : "USDT";

  return (
    <div className="flex flex-col gap-4">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a4dff] via-[#1d4ed8] to-[#0b1b3a] p-5 shadow-xl shadow-primary/15 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <p className="relative text-xs font-medium uppercase tracking-[0.18em] text-white/60">
          Available
          <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[10px] tracking-normal text-white/80">
            {badge}
          </span>
        </p>
        <p className="relative mt-3 break-words text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {formatMoney(balance, displayCurrency)}
        </p>
        {usdtHint ? (
          <p className="relative mt-1.5 text-sm text-white/55">{usdtHint}</p>
        ) : null}
        <p className="relative mt-3 text-sm leading-relaxed text-white/60">
          New deposits and earnings land here. This is the amount you can
          withdraw.
        </p>
      </section>

      {reserveBalance > 0 ? (
        <section className="rounded-3xl border border-white/10 bg-[#0b1528] p-5 sm:p-6">
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

      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onDeposit}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-sm font-semibold text-[#12307a] shadow-lg transition hover:bg-white/90"
        >
          <ArrowDownLeft className="h-4 w-4 shrink-0" />
          Deposit
        </button>
        <button
          type="button"
          onClick={onWithdraw}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#132347] py-4 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-[#1a2f5a]"
        >
          <ArrowUpRight className="h-4 w-4 shrink-0" />
          Withdraw
        </button>
        <button
          type="button"
          onClick={onTransfer}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#132347] py-4 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-[#1a2f5a]"
        >
          <ArrowLeftRight className="h-4 w-4 shrink-0" />
          Transfer
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onManageWallets}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-3.5 text-sm text-white/85 transition hover:bg-white/[0.08] hover:text-white"
        >
          <WalletCards className="h-4 w-4 shrink-0" />
          {savedWalletCount > 0
            ? `Saved wallets (${savedWalletCount})`
            : "Add a withdrawal wallet"}
        </button>
        <Link
          href="/wallet/auto-withdraw"
          className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] py-3.5 text-sm text-white/85 transition hover:bg-white/[0.08] hover:text-white"
        >
          Auto-withdraw
        </Link>
      </section>
    </div>
  );
}
