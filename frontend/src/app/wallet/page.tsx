"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, type WalletLedgerItem, type WalletSummary } from "@/lib/api";
import { WalletBalanceCard } from "@/components/wallet/wallet-balance-card";
import { WalletDepositModal } from "@/components/wallet/wallet-deposit-modal";
import { WalletWithdrawModal } from "@/components/wallet/wallet-withdraw-modal";
import { WalletTransferModal } from "@/components/wallet/wallet-transfer-modal";
import { WalletWithdrawFeeNotice } from "@/components/wallet/wallet-withdraw-fee-notice";
import { WalletSavedWalletsModal } from "@/components/wallet/wallet-saved-withdrawal-wallets";
import { WalletPendingWithdrawals } from "@/components/wallet/wallet-pending-withdrawals";
import { CurrencySwitcher } from "@/components/currency-switcher";
import { formatCurrency } from "@/lib/utils";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { syncApiAuthToken, useAuthStore } from "@/stores/auth";
import { Loader2, RefreshCw } from "lucide-react";

function walletTxTypeLabel(type: string) {
  switch (type) {
    case "TRANSFER_OUT":
      return "Transfer out";
    case "TRANSFER_IN":
      return "Transfer in";
    default:
      return type.replaceAll("_", " ").toLowerCase();
  }
}

export default function WalletPage() {
  const { ready } = useRequireAuth();
  const token = useAuthStore((s) => s.token);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [txs, setTxs] = useState<WalletLedgerItem[]>([]);
  const [walletCount, setWalletCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [walletsOpen, setWalletsOpen] = useState(false);

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
      const [s, t, wallets] = await Promise.all([
        api.wallet.summary(),
        api.wallet.transactions(),
        api.wallet.withdrawalWallets().catch(() => []),
      ]);
      setSummary(s);
      setTxs(t.items);
      setWalletCount(wallets.length);
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
          <p className="mt-1 text-sm text-gray-400">
            Deposit, transfer, and request withdrawals (admin approved)
          </p>
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
            onWithdraw={() => setWithdrawOpen(true)}
            onDeposit={() => setDepositOpen(true)}
            onTransfer={() => setTransferOpen(true)}
            onManageWallets={() => setWalletsOpen(true)}
          />
          <WalletPendingWithdrawals onCancelled={() => void refresh()} />
          <WalletWithdrawFeeNotice
            feeUsdt={summary.withdrawalFeeUsdt ?? 3}
            maxWithdrawUsdt={summary.maxWithdrawUsdt}
            maintenance={summary.withdrawMaintenance}
            schedule={{
              scheduleEnabled: summary.withdrawalScheduleEnabled,
              preferredSchedule: summary.withdrawalPreferredSchedule,
              offSchedulePenaltyPercent:
                summary.withdrawalOffSchedulePenaltyPercent,
              inPreferredWindow: summary.withdrawalInPreferredWindow,
              preferredWindowLabel: summary.withdrawalPreferredWindowLabel,
              nextPreferredWindowAt: summary.withdrawalNextPreferredWindowAt,
            }}
          />
          <Card id="wallet-activity">
            <CardHeader>
              <CardTitle className="text-base">Transactions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {txs.length === 0 ? (
                <p className="text-sm text-gray-500">No transactions yet.</p>
              ) : (
                txs.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{tx.description}</p>
                      <p className="text-[10px] text-gray-500">
                        {walletTxTypeLabel(tx.type)} ·{" "}
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
        maxWithdrawUsdt={summary?.maxWithdrawUsdt}
        maintenance={summary?.withdrawMaintenance}
        feeUsdt={summary?.withdrawalFeeUsdt ?? 3}
        schedule={
          summary
            ? {
                scheduleEnabled: summary.withdrawalScheduleEnabled,
                preferredSchedule: summary.withdrawalPreferredSchedule,
                offSchedulePenaltyPercent:
                  summary.withdrawalOffSchedulePenaltyPercent,
                inPreferredWindow: summary.withdrawalInPreferredWindow,
                preferredWindowLabel: summary.withdrawalPreferredWindowLabel,
                nextPreferredWindowAt: summary.withdrawalNextPreferredWindowAt,
              }
            : undefined
        }
        onComplete={() => void refresh()}
      />
      <WalletTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        availableBalance={summary?.availableBalance ?? 0}
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
