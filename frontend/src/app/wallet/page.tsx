"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type WalletLedgerItem, type WalletSummary } from "@/lib/api";
import { WalletBalanceCard } from "@/components/wallet/wallet-balance-card";
import { WalletDepositModal } from "@/components/wallet/wallet-deposit-modal";
import { WalletWithdrawModal } from "@/components/wallet/wallet-withdraw-modal";
import { WalletReceiveModal } from "@/components/wallet/wallet-receive-modal";
import { formatCurrency } from "@/lib/utils";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { Loader2 } from "lucide-react";

export default function WalletPage() {
  const { ready } = useRequireAuth();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [txs, setTxs] = useState<WalletLedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        api.wallet.summary(),
        api.wallet.transactions(),
      ]);
      setSummary(s);
      setTxs(t.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready]);

  if (!ready) return <AuthLoadingScreen />;

  if (loading && !summary) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Wallet</h1>
        <p className="mt-1 text-sm text-gray-400">
          USDT balance for subscriptions, deposits, and earnings
        </p>
      </div>

      {summary && (
        <WalletBalanceCard
          balance={summary.availableBalance}
          totalEarned={summary.totalEarned}
          totalDeposited={summary.totalDeposited}
          onSend={() => setWithdrawOpen(true)}
          onReceive={() => setReceiveOpen(true)}
          onDeposit={() => setDepositOpen(true)}
        />
      )}

      {summary && (
        <div className="grid grid-cols-3 gap-2">
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
              <p className="text-sm font-bold text-white">
                {formatCurrency(item.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Assets</CardTitle>
          <span className="text-xs text-gray-500">USDT</span>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-400">
                ₮
              </div>
              <div>
                <p className="font-medium text-white">USDT</p>
                <p className="text-xs text-gray-500">Tether USD</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-white">
                {formatCurrency(summary?.availableBalance ?? 0)}
              </p>
              <p className="text-xs text-gray-500">Available</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
        onComplete={() => void refresh()}
      />
      <WalletReceiveModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        onDeposit={() => setDepositOpen(true)}
      />
    </div>
  );
}
