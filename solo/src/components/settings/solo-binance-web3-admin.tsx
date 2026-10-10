"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, type ConnectedBinanceWeb3Wallets } from "@/lib/api";
import { Loader2 } from "lucide-react";

function fmt(n: number | null, digits: number) {
  return n == null ? "—" : n.toFixed(digits);
}

export function SoloBinanceWeb3Admin() {
  const [data, setData] = useState<ConnectedBinanceWeb3Wallets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await api.wallet.connectedBinanceWeb3Wallets());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load connected wallets",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Connected Binance Web3 wallets</CardTitle>
        <CardDescription>
          Admin only. Wallets users connected for withdrawals, with live BSC
          balances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {data && (
            <p className="text-foreground">
              {data.count} connected · total{" "}
              <span className="font-semibold tabular-nums">
                {data.totalUsdt.toFixed(2)} USDT
              </span>
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        {error && <p className="text-danger">{error}</p>}
        {loading && !data ? (
          <p className="flex items-center gap-2 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading wallets…
          </p>
        ) : data && data.wallets.length === 0 ? (
          <p className="text-muted">No user has connected a wallet yet.</p>
        ) : data ? (
          <div className="space-y-2">
            {data.wallets.map((w) => (
              <div
                key={w.userId}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2"
              >
                <p className="font-medium text-foreground">
                  {w.displayName || w.email || w.userId}
                  {w.displayName && w.email ? (
                    <span className="ml-2 text-xs text-muted">{w.email}</span>
                  ) : null}
                </p>
                <a
                  href={`https://bscscan.com/address/${w.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-xs text-primary hover:underline"
                >
                  {w.address}
                </a>
                <p className="mt-1 text-xs text-muted">
                  USDT{" "}
                  <span className="tabular-nums text-foreground">
                    {fmt(w.usdtBalance, 2)}
                  </span>{" "}
                  · BNB{" "}
                  <span className="tabular-nums text-foreground">
                    {fmt(w.bnbBalance, 4)}
                  </span>
                  {w.connectedAt
                    ? ` · connected ${new Date(w.connectedAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
