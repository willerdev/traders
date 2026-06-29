"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  BookOpen,
  Crown,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { api, type CopyTradingDashboard } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import { RISK_PERCENT } from "@/lib/platform-rules";

function fmtPnl(value: number, currency = "USD") {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${formatCurrency(value)} ${currency}`;
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "open") return "bg-emerald-500/15 text-emerald-400";
  if (s === "closed") return "bg-sky-500/15 text-sky-400";
  if (s === "failed") return "bg-red-500/15 text-red-400";
  return "bg-white/10 text-gray-400";
}

export default function Mt5Page() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<CopyTradingDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "positions" | "journal">(
    "overview",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.signals.copyDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load MT5 data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    void load();
  }, [isAuthenticated, router, load]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const info = data?.terminal?.information;
  const currency = info?.currency ?? "USD";
  const balance = info?.balance ?? 0;
  const equity = info?.equity ?? 0;
  const floating = data?.stats.floatingProfit ?? 0;
  const realized = data?.stats.totalRealizedProfit ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">MT5 Copy Pool</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            Second live account — mirrors only the top 3 ranked traders each week
            at {data?.riskPercent ?? RISK_PERCENT}% risk per trade on account
            equity.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </motion.div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!data?.configured && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-amber-200/90">
            {data?.message ??
              "Copy account not configured — set METAAPI_COPY_ACCOUNT_ID on the server."}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Wallet className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs text-gray-500">Balance</p>
              <p className="text-lg font-semibold text-white">
                {formatCurrency(balance)} {currency}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Activity className="h-8 w-8 text-sky-400" />
            <div>
              <p className="text-xs text-gray-500">Equity</p>
              <p className="text-lg font-semibold text-white">
                {formatCurrency(equity)} {currency}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            {floating >= 0 ? (
              <TrendingUp className="h-8 w-8 text-emerald-400" />
            ) : (
              <TrendingDown className="h-8 w-8 text-red-400" />
            )}
            <div>
              <p className="text-xs text-gray-500">Floating P/L</p>
              <p
                className={cn(
                  "text-lg font-semibold",
                  floating >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {fmtPnl(floating, currency)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <BookOpen className="h-8 w-8 text-violet-400" />
            <div>
              <p className="text-xs text-gray-500">Realized (journal)</p>
              <p
                className={cn(
                  "text-lg font-semibold",
                  realized >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {fmtPnl(realized, currency)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-amber-400" />
            Copying this week&apos;s top 3
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.leaders.length === 0 ? (
            <p className="text-sm text-gray-500">No leaderboard data yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {data?.leaders.map((leader) => (
                <div
                  key={leader.userId}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-amber-400/90">
                      #{leader.rank}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {leader.tier}
                    </Badge>
                  </div>
                  <p className="mt-1 font-medium text-white">{leader.displayName}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Score {leader.score} · {leader.winRate.toFixed(0)}% win
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 flex gap-2">
        {(["overview", "positions", "journal"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "secondary"}
            onClick={() => setTab(t)}
          >
            {t === "overview" ? "Overview" : t === "positions" ? "Positions" : "Journal"}
          </Button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open positions</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.terminal?.positions.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-500">No open copy positions.</p>
              ) : (
                <ul className="space-y-3">
                  {data?.terminal?.positions.map((pos) => {
                    const pnl = pos.profit + pos.unrealizedProfit + pos.swap + pos.commission;
                    return (
                      <li
                        key={pos.id}
                        className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0"
                      >
                        <div>
                          <p className="font-medium text-white">
                            {pos.symbol}{" "}
                            <span className="text-xs text-gray-500">
                              {pos.type} · {pos.volume} lots
                            </span>
                          </p>
                          <p className="text-xs text-gray-500">
                            @ {pos.openPrice} → {pos.currentPrice}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "text-sm font-medium",
                            pnl >= 0 ? "text-emerald-400" : "text-red-400",
                          )}
                        >
                          {fmtPnl(pnl, currency)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent journal</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.journal.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-500">No copy trades yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data?.journal.slice(0, 6).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-start justify-between gap-2 border-b border-white/5 pb-3 last:border-0"
                    >
                      <div>
                        <p className="text-sm text-white">
                          #{entry.sourceRank} {entry.sourceName} · {entry.symbol}{" "}
                          {entry.direction}
                        </p>
                        <p className="text-xs text-gray-500">
                          {entry.volume != null ? `${entry.volume} lots` : "—"}
                          {entry.executedAt
                            ? ` · ${new Date(entry.executedAt).toLocaleString()}`
                            : ""}
                        </p>
                      </div>
                      <Badge className={statusBadge(entry.status)}>{entry.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "positions" && (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-gray-500">
                  <th className="pb-2 pr-4">Symbol</th>
                  <th className="pb-2 pr-4">Side</th>
                  <th className="pb-2 pr-4">Lots</th>
                  <th className="pb-2 pr-4">Open</th>
                  <th className="pb-2 pr-4">SL / TP</th>
                  <th className="pb-2">P/L</th>
                </tr>
              </thead>
              <tbody>
                {(data?.terminal?.positions ?? []).map((pos) => {
                  const pnl = pos.profit + pos.unrealizedProfit + pos.swap + pos.commission;
                  return (
                    <tr key={pos.id} className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white">{pos.symbol}</td>
                      <td className="py-3 pr-4">{pos.type}</td>
                      <td className="py-3 pr-4">{pos.volume}</td>
                      <td className="py-3 pr-4">{pos.openPrice}</td>
                      <td className="py-3 pr-4 text-gray-400">
                        {pos.stopLoss ?? "—"} / {pos.takeProfit ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "py-3 font-medium",
                          pnl >= 0 ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {fmtPnl(pnl, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(data?.terminal?.positions.length ?? 0) === 0 && (
              <p className="py-8 text-center text-sm text-gray-500">No open positions.</p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "journal" && (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-gray-500">
                  <th className="pb-2 pr-4">Trader</th>
                  <th className="pb-2 pr-4">Setup</th>
                  <th className="pb-2 pr-4">Lots</th>
                  <th className="pb-2 pr-4">Entry</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">P/L</th>
                  <th className="pb-2">When</th>
                </tr>
              </thead>
              <tbody>
                {(data?.journal ?? []).map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5">
                    <td className="py-3 pr-4">
                      <span className="text-amber-400/90">#{entry.sourceRank}</span>{" "}
                      {entry.sourceName}
                    </td>
                    <td className="py-3 pr-4 text-white">
                      {entry.symbol} {entry.direction}
                    </td>
                    <td className="py-3 pr-4">{entry.volume ?? "—"}</td>
                    <td className="py-3 pr-4">{entry.entryPrice ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <Badge className={statusBadge(entry.status)}>{entry.status}</Badge>
                    </td>
                    <td
                      className={cn(
                        "py-3 pr-4 font-medium",
                        entry.profit == null
                          ? "text-gray-500"
                          : entry.profit >= 0
                            ? "text-emerald-400"
                            : "text-red-400",
                      )}
                    >
                      {entry.profit != null ? fmtPnl(entry.profit, currency) : "—"}
                    </td>
                    <td className="py-3 text-gray-500">
                      {entry.executedAt
                        ? new Date(entry.executedAt).toLocaleString()
                        : new Date(entry.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.journal.length ?? 0) === 0 && (
              <p className="py-8 text-center text-sm text-gray-500">
                Trades from top-3 traders will appear here when they execute on MetaAPI.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
