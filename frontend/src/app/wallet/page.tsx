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
import { ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { MaintenanceBanner } from "@/components/maintenance-banner";

function walletTxTypeLabel(type: string) {
  switch (type) {
    case "TRANSFER_OUT":
      return "Transfer out";
    case "TRANSFER_IN":
      return "Transfer in";
    case "RESERVE_HOLD":
      return "Reserve hold";
    case "RESERVE_RELEASE":
      return "Reserve release";
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
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10 xl:max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">
            Tradeguard · Money
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
            Wallet
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-400">
            Deposit, transfer, and request withdrawals — every withdrawal is
            reviewed before it is sent.
          </p>
        </div>
        <div className="flex items-center gap-1">
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
        <div className="space-y-5">
          <WalletBalanceCard
            balance={summary.availableBalance}
            reserveBalance={summary.reserveBalance ?? 0}
            displayCurrency={summary.displayCurrency}
            savedWalletCount={walletCount}
            onWithdraw={() => setWithdrawOpen(true)}
            onDeposit={() => setDepositOpen(true)}
            onTransfer={() => setTransferOpen(true)}
            onManageWallets={() => setWalletsOpen(true)}
          />
          <WalletPendingWithdrawals onCancelled={() => void refresh()} />
          <MaintenanceBanner
            maintenance={summary.withdrawMaintenance}
            withdrawDays={summary.withdrawDays}
          />
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
                    className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3.5 py-3 transition hover:border-cyan-300/20 hover:bg-white/[0.04] sm:items-center"
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:mt-0 ${
                        tx.amount >= 0
                          ? "bg-emerald-400/15 text-emerald-300"
                          : "bg-rose-400/15 text-rose-300"
                      }`}
                    >
                      {tx.amount >= 0 ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-normal break-words text-sm text-white">
                        {tx.description}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-500">
                        {walletTxTypeLabel(tx.type)} ·{" "}
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={
                        tx.amount >= 0
                          ? "text-sm font-bold tabular-nums text-success"
                          : "text-sm font-bold tabular-nums text-danger"
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
