"use client";

import { formatCurrency } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, Settings } from "lucide-react";
import Link from "next/link";

type WalletBalanceCardProps = {
  balance: number;
  totalEarned: number;
  totalDeposited: number;
  onWithdraw: () => void;
  onDeposit: () => void;
};

export function WalletBalanceCard({
  balance,
  totalEarned,
  totalDeposited,
  onWithdraw,
  onDeposit,
}: WalletBalanceCardProps) {
  const changePct =
    totalDeposited > 0 ? (totalEarned / totalDeposited) * 100 : 0;

  const actions = [
    { label: "Withdraw", icon: ArrowUpRight, onClick: onWithdraw },
    { label: "Deposit", icon: ArrowDownLeft, onClick: onDeposit },
  ] as const;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-[#1d4ed8] to-[#1e3a8a] p-5 shadow-lg shadow-primary/20">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-black/20 blur-2xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-white/70">
            Current balance{" "}
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] uppercase">
              USDT
            </span>
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {formatCurrency(balance)}
          </p>
          {totalEarned > 0 && (
            <p className="mt-1 text-sm text-emerald-300">
              ↑ {formatCurrency(totalEarned)}
              {changePct > 0 && ` (+${changePct.toFixed(1)}%)`}
            </p>
          )}
        </div>
        <Link
          href="/dashboard?tab=settings"
          className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Wallet settings"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-2">
        {actions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="flex flex-col items-center gap-1.5 rounded-xl py-2 transition-colors hover:bg-white/10"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#121a2e]/40 backdrop-blur-sm">
              <Icon className="h-5 w-5 text-white" />
            </span>
            <span className="text-[11px] font-medium text-white/90">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
