"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type WalletLedgerItem, type WalletSummary } from "@/lib/api";
import { WalletDepositPanel } from "@/components/wallet/wallet-deposit-panel";
import { WalletWithdrawForm } from "@/components/wallet/wallet-withdraw-form";
import { formatCurrency } from "@/lib/utils";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { Loader2 } from "lucide-react";

export default function WalletPage() {
  const { ready } = useRequireAuth();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [txs, setTxs] = useState<WalletLedgerItem[]>([]);
  const [loading, setLoading] = useState(true);

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
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Wallet</h1>
        <p className="mt-1 text-sm text-gray-400">
          Subscriptions, deposits, daily earnings, and withdrawals
        </p>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Available", value: summary.availableBalance },
            { label: "Deposited", value: summary.totalDeposited },
            { label: "Earned", value: summary.totalEarned },
            { label: "Subscriptions paid", value: summary.subscriptionPaid },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="text-xl font-bold text-white">
                  {formatCurrency(item.value)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deposit</CardTitle>
          </CardHeader>
          <CardContent>
            <WalletDepositPanel
              minDeposit={summary?.minDepositUsdt ?? 50}
              onComplete={() => void refresh()}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Withdraw</CardTitle>
          </CardHeader>
          <CardContent>
            <WalletWithdrawForm
              availableBalance={summary?.availableBalance ?? 0}
              onComplete={() => void refresh()}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {txs.length === 0 ? (
            <p className="text-sm text-gray-500">No transactions yet.</p>
          ) : (
            txs.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{tx.description}</p>
                  <p className="text-[10px] text-gray-500">
                    {tx.type} · {new Date(tx.createdAt).toLocaleString()}
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
  );
}
