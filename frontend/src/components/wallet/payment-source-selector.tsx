"use client";

import { cn, formatCurrency } from "@/lib/utils";
import { Wallet, ArrowDownToLine, RefreshCw, Smartphone } from "lucide-react";

export type PaymentSource = "wallet" | "crypto" | "momo";

export function PaymentSourceSelector({
  walletBalance,
  lockedBalance = 0,
  pendingDeposits = 0,
  amountDue,
  source,
  onSourceChange,
  onRefreshWallet,
  refreshingWallet = false,
  momoEnabled = false,
  className,
}: {
  walletBalance: number;
  lockedBalance?: number;
  pendingDeposits?: number;
  amountDue: number;
  source: PaymentSource;
  onSourceChange: (source: PaymentSource) => void;
  onRefreshWallet?: () => void;
  refreshingWallet?: boolean;
  momoEnabled?: boolean;
  className?: string;
}) {
  const canPayFromWallet = walletBalance >= amountDue;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Payment source
        </p>
        {onRefreshWallet && (
          <button
            type="button"
            onClick={onRefreshWallet}
            disabled={refreshingWallet}
            className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3 w-3", refreshingWallet && "animate-spin")}
            />
            Refresh balance
          </button>
        )}
      </div>
      <div className={cn("grid gap-2", momoEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <button
          type="button"
          onClick={() => onSourceChange("wallet")}
          className={cn(
            "rounded-xl border p-3 text-left transition-colors",
            source === "wallet"
              ? "border-primary bg-primary/10"
              : "border-[var(--color-border)] hover:border-primary/40",
          )}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Platform wallet
              </p>
              <p className="text-xs text-muted">
                {formatCurrency(walletBalance)} available
              </p>
            </div>
          </div>
          {lockedBalance > 0 && (
            <p className="mt-1.5 text-[10px] text-muted">
              {formatCurrency(lockedBalance)} locked in earning plans (not
              usable for subscription)
            </p>
          )}
          {pendingDeposits > 0 && (
            <p className="mt-1.5 text-[10px] text-amber-400/90">
              {pendingDeposits} deposit{pendingDeposits !== 1 ? "s" : ""}{" "}
              confirming — tap Refresh balance
            </p>
          )}
          {!canPayFromWallet && (
            <p className="mt-2 text-xs text-danger">
              Need {formatCurrency(amountDue - walletBalance)} more in your
              platform wallet — deposit on Wallet page or pay with crypto below
            </p>
          )}
        </button>

        {momoEnabled && (
          <button
            type="button"
            onClick={() => onSourceChange("momo")}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              source === "momo"
                ? "border-primary bg-primary/10"
                : "border-[var(--color-border)] hover:border-primary/40",
            )}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20">
                <Smartphone className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Mobile Money (MoMo)
                </p>
                <p className="text-xs text-muted">
                  MTN / Airtel — approve on your phone
                </p>
              </div>
            </div>
          </button>
        )}

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
                Pay with crypto
              </p>
              <p className="text-xs text-muted">
                Send USDT from any wallet — activates on confirm
              </p>
            </div>
          </div>
        </button>
      </div>
      <p className="text-[10px] leading-snug text-muted">
        External wallets (Trust, MetaMask, etc.) are not linked automatically.
        Deposit USDT to your platform wallet first, use MoMo for local currency,
        or use Pay with crypto for a one-time renewal address.
      </p>
    </div>
  );
}
