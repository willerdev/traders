"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type WalletSummary } from "@/lib/api";
import { WalletBalanceCard } from "@/components/wallet/wallet-balance-card";
import { WalletDepositModal } from "@/components/wallet/wallet-deposit-modal";
import { WalletWithdrawModal } from "@/components/wallet/wallet-withdraw-modal";
import { WalletSavedWalletsModal } from "@/components/wallet/wallet-saved-withdrawal-wallets";
import { WalletPendingWithdrawals } from "@/components/wallet/wallet-pending-withdrawals";
import { CurrencySwitcher } from "@/components/currency-switcher";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { syncApiAuthToken, useAuthStore } from "@/stores/auth";
import { Loader2, RefreshCw } from "lucide-react";
import {
  SOLO_WALLET_WITHDRAW_PAUSED_LABEL,
  isSoloWalletWithdrawEnabled,
} from "@/lib/solo-wallet-withdraw";

export default function WalletPage() {
  const { ready } = useRequireAuth();
  const token = useAuthStore((s) => s.token);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [walletCount, setWalletCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [walletsOpen, setWalletsOpen] = useState(false);

  const refresh = useCallback(async () => {
    const authToken = syncApiAuthToken();
    if (!authToken) {
      setError("Session not ready — log out and sign in again.");
      setSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [s, wallets] = await Promise.all([
        api.wallet.summary(),
        api.wallet.withdrawalWallets().catch(() => []),
      ]);
      setSummary(s);
      setWalletCount(
        wallets.filter(
          (w) =>
            w.network === "TRC20" ||
            w.network === "ERC20" ||
            w.network === "BEP20",
        ).length,
      );
    } catch (err) {
      setSummary(null);
      setError(
        err instanceof Error ? err.message : "Could not load wallet balance",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    void refresh();
  }, [ready, token, refresh]);

  useEffect(() => {
    if (!ready || !token) return;
    const onResume = () => void refresh();
    window.addEventListener("pageshow", onResume);
    window.addEventListener("focus", onResume);
    const onVis = () => {
      if (document.visibilityState === "visible") onResume();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ready, token, refresh]);

  if (!ready) return <AuthLoadingScreen />;

  if (loading && !summary && !error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Wallet</h1>
          <p className="mt-1 text-sm text-gray-400">Deposit and withdraw USDT</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CurrencySwitcher
            displayCurrency={summary?.displayCurrency}
            onChanged={refresh}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {summary && (
        <div className="space-y-4">
          <WalletBalanceCard
            balance={summary.availableBalance}
            displayCurrency={summary.displayCurrency}
            savedWalletCount={walletCount}
            onWithdraw={() => {
              if (!isSoloWalletWithdrawEnabled(summary)) return;
              setWithdrawOpen(true);
            }}
            onDeposit={() => setDepositOpen(true)}
            onManageWallets={() => setWalletsOpen(true)}
            withdrawDisabled={!isSoloWalletWithdrawEnabled(summary)}
            withdrawDisabledLabel={SOLO_WALLET_WITHDRAW_PAUSED_LABEL}
          />
          {summary.soloTradeOperator || summary.tradingProfit ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Your profit and loss
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {(summary.tradingProfit?.realizedPnl ?? 0).toFixed(2)} USDT
              </p>
              <p className="text-xs text-muted">
                Closed P&amp;L from your trades only. Available to withdraw{" "}
                {(
                  summary.tradingProfit?.availableToWithdraw ??
                  summary.availableBalance
                ).toFixed(2)}{" "}
                USDT
              </p>
            </div>
          ) : null}
          <WalletPendingWithdrawals onCancelled={() => void refresh()} />
        </div>
      )}

      <WalletDepositModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        minPlanDeposit={summary?.minDepositUsdt ?? 50}
        onComplete={() => void refresh()}
      />
      <WalletWithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        availableBalance={summary?.availableBalance ?? 0}
        feeUsdt={summary?.withdrawalFeeUsdt ?? 0}
        onComplete={() => void refresh()}
      />
      <WalletSavedWalletsModal
        open={walletsOpen}
        onClose={() => setWalletsOpen(false)}
        onChanged={() => void refresh()}
      />
    </div>
  );
}
