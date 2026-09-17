"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, PendingWalletWithdrawal } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Clock, Loader2, XCircle } from "lucide-react";

type Props = {
  onCancelled?: () => void;
};

export function WalletPendingWithdrawals({ onCancelled }: Props) {
  const [items, setItems] = useState<PendingWalletWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await api.wallet.pendingWithdrawals();
      setItems(rows);
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error ? err.message : "Could not load pending withdrawals",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: string, grossAmount: number) {
    const ok = window.confirm(
      `Cancel this $${grossAmount.toFixed(2)} USDT withdrawal? The full amount will be returned to your wallet.`,
    );
    if (!ok) return;

    setCancellingId(id);
    setError(null);
    try {
      await api.wallet.cancelWithdrawal(id);
      await load();
      onCancelled?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not cancel withdrawal",
      );
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0 && !error) {
    return null;
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-400" />
          <CardTitle className="text-base">Pending withdrawals</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : null}
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-white/5 bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-white">
                  {formatCurrency(item.grossAmount)} USDT
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Net after fees: {formatCurrency(item.netAmount)} ·{" "}
                  {item.payoutMethod === "MOBILE_MONEY" ? "MoMo" : "TRC20"}
                </p>
                {item.walletAddress ? (
                  <p className="mt-1 truncate font-mono text-xs text-gray-600">
                    {item.walletAddress}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-gray-500">
                  Requested {new Date(item.requestedAt).toLocaleString()}
                </p>
                {item.scheduledApproveAt ? (
                  <p className="mt-1 text-xs text-amber-400/90">
                    Scheduled{" "}
                    {new Date(item.scheduledApproveAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
              <Badge variant="gold">Pending</Badge>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 w-full sm:w-auto"
              disabled={cancellingId === item.id}
              onClick={() => void cancel(item.id, item.grossAmount)}
            >
              {cancellingId === item.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Cancel & return funds
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
