"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, type WalletLedgerItem, type WalletSummary } from "@/lib/api";
import { WalletBalanceCard } from "@/components/wallet/wallet-balance-card";
import { WalletDepositModal } from "@/components/wallet/wallet-deposit-modal";
import { WalletWithdrawModal } from "@/components/wallet/wallet-withdraw-modal";
import { WalletWithdrawFeeNotice } from "@/components/wallet/wallet-withdraw-fee-notice";
import { WalletSavedWithdrawalWallets } from "@/components/wallet/wallet-saved-withdrawal-wallets";
import { CurrencySwitcher } from "@/components/currency-switcher";
import {
  cn,
  formatCurrency,
  formatMoney,
  isLocalCurrencyDisplay,
} from "@/lib/utils";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { syncApiAuthToken, useAuthStore } from "@/stores/auth";
import { Loader2, RefreshCw } from "lucide-react";

export default function WalletPage() {
  const { ready } = useRequireAuth();
  const token = useAuthStore((s) => s.token);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [txs, setTxs] = useState<WalletLedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const localCurrency = isLocalCurrencyDisplay(summary?.displayCurrency);

  const refresh = useCallback(async () => {
    const authToken = syncApiAuthToken();
    if (!authToken) {
      setError("Session not ready — log out and sign in again.");
      setSummary(null);
      setTxs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([
        api.wallet.summary(),
        api.wallet.transactions(),
      ]);
      setSummary(s);
      setTxs(t.items);
    } catch (err) {
      setSummary(null);
      setTxs([]);
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
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onResume();
    });

    return () => {
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("focus", onResume);
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
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6 xl:max-w-7xl xl:px-8 xl:py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet</h1>
          <p className="mt-1 text-sm text-gray-400">
            Balance and earnings — USDT ledger with optional local display
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CurrencySwitcher
            displayCurrency={summary?.displayCurrency}
            onChanged={refresh}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
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

      <div className="space-y-4 xl:grid xl:grid-cols-12 xl:items-start xl:gap-5 xl:space-y-0">
        {summary && (
          <div className="xl:col-span-7 xl:row-start-1">
            <WalletBalanceCard
              balance={summary.availableBalance}
              totalEarned={summary.totalEarned}
              totalDeposited={summary.totalDeposited}
              displayCurrency={summary.displayCurrency}
              onWithdraw={() => setWithdrawOpen(true)}
              onDeposit={() => setDepositOpen(true)}
            />
          </div>
        )}

        {summary && (
          <div className="xl:col-span-7 xl:row-start-2">
            <WalletWithdrawFeeNotice feeUsdt={summary.withdrawalFeeUsdt ?? 3} />
          </div>
        )}

        {summary && (
          <Card className="xl:col-span-5 xl:row-span-2 xl:row-start-1 xl:h-full">
            <CardHeader>
              <CardTitle className="text-base">Withdrawal wallets</CardTitle>
            </CardHeader>
            <CardContent>
              <WalletSavedWithdrawalWallets />
            </CardContent>
          </Card>
        )}

        {summary && (
          <div className="grid grid-cols-3 gap-2 xl:col-span-7 xl:row-start-3">
            {[
              { label: "Deposited", value: summary.totalDeposited },
              { label: "Earned", value: summary.totalEarned },
              { label: "Locked", value: summary.lockedBalance },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3"
              >
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  {item.label}
                </p>
                <p
                  className={cn(
                    "font-bold text-white",
                    localCurrency ? "text-xs sm:text-sm" : "text-sm",
                  )}
                >
                  {formatMoney(item.value, summary.displayCurrency)}
                </p>
              </div>
            ))}
          </div>
        )}

        <Card className="xl:col-span-5 xl:row-start-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Assets</CardTitle>
            <span className="text-xs text-gray-500">
              {summary?.displayCurrency?.code ?? "USDT"}
            </span>
          </CardHeader>
          <CardContent>
            {summary ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-400">
                    ₮
                  </div>
                  <div>
                    <p className="font-medium text-white">USDT</p>
                    <p className="text-xs text-gray-500">
                      Shown as {summary.displayCurrency?.code ?? "USDT"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-bold text-white",
                      localCurrency ? "text-sm" : "text-base",
                    )}
                  >
                    {formatMoney(
                      summary.availableBalance,
                      summary.displayCurrency,
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(summary.availableBalance)} USDT
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Balance unavailable — tap Retry above.
              </p>
            )}
          </CardContent>
        </Card>

        <Card id="wallet-activity" className="xl:col-span-12 xl:row-start-4">
          <CardHeader>
            <CardTitle className="text-base">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0">
            {txs.length === 0 ? (
              <p className="text-sm text-gray-500 xl:col-span-2">
                {summary ? "No transactions yet." : "Transactions unavailable."}
              </p>
            ) : (
              txs.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{tx.description}</p>
                    <p className="text-[10px] text-gray-500">
                      {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={
                      tx.amount >= 0
                        ? "text-sm font-bold text-success"
                        : "text-sm font-bold text-danger"
                    }
                  >
                    {tx.amount >= 0 ? "+" : ""}
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

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
        feeUsdt={summary?.withdrawalFeeUsdt ?? 3}
        onComplete={() => void refresh()}
      />
    </div>
  );
}
