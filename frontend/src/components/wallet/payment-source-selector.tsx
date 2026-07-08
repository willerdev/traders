"use client";

import { cn, formatCurrency } from "@/lib/utils";
import { Wallet, ArrowDownToLine } from "lucide-react";

export type PaymentSource = "wallet" | "crypto";

export function PaymentSourceSelector({
  walletBalance,
  amountDue,
  source,
  onSourceChange,
  className,
}: {
  walletBalance: number;
  amountDue: number;
  source: PaymentSource;
  onSourceChange: (source: PaymentSource) => void;
  className?: string;
}) {
  const canPayFromWallet = walletBalance >= amountDue;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Payment source
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSourceChange("wallet")}
          disabled={!canPayFromWallet && source !== "wallet"}
          className={cn(
            "rounded-xl border p-3 text-left transition-colors",
            source === "wallet"
              ? "border-primary bg-primary/10"
              : "border-[var(--color-border)] hover:border-primary/40",
            !canPayFromWallet && "opacity-50",
          )}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Wallet balance
              </p>
              <p className="text-xs text-muted">
                {formatCurrency(walletBalance)} available
              </p>
            </div>
          </div>
          {!canPayFromWallet && (
            <p className="mt-2 text-xs text-danger">
              Need {formatCurrency(amountDue - walletBalance)} more — deposit
              first or pay with crypto
            </p>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSourceChange("crypto")}
          className={cn(
            "rounded-xl border p-3 text-left transition-colors",
            source === "crypto"
              ? "border-primary bg-primary/10"
              : "border-[var(--color-border)] hover:border-primary/40",
          )}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
              <ArrowDownToLine className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                New crypto deposit
              </p>
              <p className="text-xs text-muted">
                Send USDT to a payment address
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
