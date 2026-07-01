"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ChevronRight,
  Clock,
  History,
  Layers,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { api, type OpenSetupItem, type UserMt5Terminal, type UserMt5Trade } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import {
  SetupDetailModal,
  type SetupSummary,
} from "@/components/dashboard/setup-detail-modal";
import { SetupExecutionBadge } from "@/components/dashboard/setup-execution-badge";

type Tab = "setups" | "trades" | "history";

function fmtPnl(value: number) {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${formatCurrency(value)}`;
}

function toSetupSummary(setup: OpenSetupItem): SetupSummary {
  return {
    signalId: setup.signalId,
    symbol: setup.symbol,
    direction: setup.direction,
    entryMin: setup.entryMin,
    entryMax: setup.entryMax,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    status: "OPEN",
    submittedAt: setup.submittedAt,
  };
}

function historyStatusClass(status: string) {
  const s = status.toUpperCase();
  if (s === "WON") return "bg-emerald-500/15 text-emerald-400";
  if (s === "LOST") return "bg-red-500/15 text-red-400";
  if (s === "ARCHIVED" || s === "CANCELLED") return "bg-white/10 text-gray-400";
  return "bg-sky-500/15 text-sky-400";
}

export default function Mt5UserPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const userRole = useAuthStore((s) => s.user?.role);
  const [data, setData] = useState<UserMt5Terminal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("trades");
  const [selectedSetup, setSelectedSetup] = useState<SetupSummary | null>(null);
  const [closingKey, setClosingKey] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      setData(await api.signals.mt5Terminal());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load MT5 data");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hasHydrated, isAuthenticated, router, load]);

  useEffect(() => {
    if (!isAuthenticated || tab !== "trades") return;
    const id = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, tab, load]);

  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const setups = data?.setups.items ?? [];
  const trades = data?.trades ?? [];
  const history = data?.history.items ?? [];
  const floating = data?.stats.floatingProfit ?? 0;
  const limitCount = data?.stats.limitCount ?? 0;
  const runningCount = data?.stats.runningCount ?? 0;

  async function handleCloseTrade(trade: UserMt5Trade) {
    const label =
      trade.kind === "limit"
        ? `Cancel limit order on ${trade.symbol}?`
        : `Close running ${trade.symbol} trade?`;
    if (!confirm(label)) return;

    const key = trade.signalId ?? trade.positionId ?? trade.orderId ?? trade.symbol;
    setClosingKey(key);
    try {
      if (trade.signalId) {
        await api.signals.closeTrade(trade.signalId);
      } else {
        const id = trade.positionId ?? trade.orderId;
        if (!id) throw new Error("No trade id to close");
        await api.signals.closeMt5Position(id);
      }
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close trade");
    } finally {
      setClosingKey(null);
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Layers; count?: number }[] =
    [
      { id: "setups", label: "Setups", icon: Layers, count: setups.length },
      { id: "trades", label: "Trades", icon: Activity, count: trades.length },
      { id: "history", label: "History", icon: History, count: history.length },
    ];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg flex-col md:max-w-2xl">
      <div className="sticky top-0 z-20 border-b border-white/5 bg-[var(--color-surface)]/95 px-4 pb-3 pt-4 backdrop-blur-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-white">MT5</h1>
            <p className="text-xs text-gray-500">
              Your setups on platform MT5 — limits &amp; running trades
            </p>
          </div>
          <div className="flex gap-1">
            {userRole === "ADMIN" && (
              <Link href="/mt5/copy">
                <Button variant="ghost" size="sm" className="text-xs text-gray-400">
                  Copy pool
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/[0.03] p-3">
          <div>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500">
              <Clock className="h-3 w-3" />
              Limits
            </p>
            <p className="mt-0.5 text-sm font-semibold text-amber-300/90">
              {limitCount}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">
              Running
            </p>
            <p className="mt-0.5 text-sm font-semibold text-emerald-400">
              {runningCount}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">
              Floating
            </p>
            <p
              className={cn(
                "mt-0.5 text-sm font-semibold",
                floating >= 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {fmtPnl(floating)}
            </p>
          </div>
        </div>

        {data?.message && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
            {data.message}
          </p>
        )}

        <div className="mt-3 flex rounded-lg bg-white/[0.04] p-1">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors",
                tab === id
                  ? "bg-primary text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {count != null && count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px]",
                    tab === id ? "bg-white/20" : "bg-white/10",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="flex-1 px-4 py-4">
        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : tab === "setups" ? (
          <SetupsTab setups={setups} onSelect={setSelectedSetup} />
        ) : tab === "trades" ? (
          <TradesTab
            trades={trades}
            onClose={handleCloseTrade}
            closingKey={closingKey}
          />
        ) : (
          <HistoryTab history={history} />
        )}
      </div>

      {selectedSetup && (
        <SetupDetailModal
          setup={selectedSetup}
          onClose={() => setSelectedSetup(null)}
          onUpdated={() => {
            void load(true);
            setSelectedSetup(null);
          }}
        />
      )}
    </div>
  );
}

function SetupsTab({
  setups,
  onSelect,
}: {
  setups: OpenSetupItem[];
  onSelect: (s: SetupSummary) => void;
}) {
  if (setups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
        <Layers className="mx-auto h-8 w-8 text-gray-600" />
        <p className="mt-3 text-sm text-gray-400">No open setups</p>
        <Link href="/submit">
          <Button size="sm" className="mt-4">
            Submit a setup
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {setups.map((setup) => {
        const live = setup.liveTrade;
        const running =
          live?.status === "open" ||
          live?.status === "pending" ||
          setup.resolution.metaApiExecuted;

        return (
          <li key={setup.signalId}>
            <button
              type="button"
              onClick={() => onSelect(toSetupSummary(setup))}
              className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left active:bg-white/[0.04]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white">{setup.symbol}</span>
                  <Badge variant={setup.direction === "BUY" ? "success" : "danger"}>
                    {setup.direction}
                  </Badge>
                  {setup.resolution.executionPhase && (
                    <SetupExecutionBadge
                      phase={setup.resolution.executionPhase}
                      label={setup.resolution.executionLabel}
                    />
                  )}
                  {live?.status === "pending" && (
                    <Badge variant="gold">Limit pending</Badge>
                  )}
                  {live?.status === "open" && (
                    <Badge variant="success">Running</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Entry {setup.entryMin} – {setup.entryMax} · SL {setup.stopLoss}{" "}
                  · TP {setup.takeProfit}
                </p>
                {running && live?.profit != null && (
                  <p
                    className={cn(
                      "mt-1 text-sm font-semibold",
                      live.profit >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {fmtPnl(live.profit)}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-600" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TradesTab({
  trades,
  onClose,
  closingKey,
}: {
  trades: UserMt5Trade[];
  onClose: (trade: UserMt5Trade) => void;
  closingKey: string | null;
}) {
  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
        <Activity className="mx-auto h-8 w-8 text-gray-600" />
        <p className="mt-3 text-sm text-gray-400">No active trades from your setups</p>
        <p className="mt-1 text-xs text-gray-600">
          Limit orders and running positions appear here after a setup is queued on
          platform MT5
        </p>
        <Link href="/submit">
          <Button size="sm" variant="secondary" className="mt-4">
            Submit setup
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {trades.map((trade) => {
        const key =
          trade.signalId ?? trade.positionId ?? trade.orderId ?? trade.symbol;
        const isLimit = trade.kind === "limit";

        return (
          <li
            key={key}
            className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-white">
                    {trade.symbol}
                  </span>
                  <Badge variant={trade.direction === "BUY" ? "success" : "danger"}>
                    {trade.direction}
                  </Badge>
                  <Badge variant={isLimit ? "gold" : "success"}>
                    {isLimit ? "Limit" : "Running"}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                  {trade.entryMin != null && trade.entryMax != null && (
                    <span className="col-span-2">
                      Zone{" "}
                      <span className="text-gray-300">
                        {trade.entryMin} – {trade.entryMax}
                      </span>
                    </span>
                  )}
                  {trade.openPrice != null && (
                    <span>
                      {isLimit ? "Limit" : "Open"}{" "}
                      <span className="text-gray-300">{trade.openPrice}</span>
                    </span>
                  )}
                  {trade.currentPrice != null && !isLimit && (
                    <span>
                      Now{" "}
                      <span className="text-gray-300">{trade.currentPrice}</span>
                    </span>
                  )}
                  <span>
                    SL{" "}
                    <span className="text-gray-300">{trade.stopLoss ?? "—"}</span>
                  </span>
                  <span>
                    TP{" "}
                    <span className="text-gray-300">{trade.takeProfit ?? "—"}</span>
                  </span>
                  {trade.volume != null && (
                    <span>
                      Lots <span className="text-gray-300">{trade.volume}</span>
                    </span>
                  )}
                </div>
                {trade.signalId && (
                  <p className="mt-1 text-[10px] text-gray-600">
                    Setup {trade.signalId}
                  </p>
                )}
                {trade.executionLabel && (
                  <p className="mt-0.5 text-[10px] text-gray-600">
                    {trade.executionLabel}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {!isLimit && trade.profit != null && (
                  <p
                    className={cn(
                      "flex items-center gap-1 text-lg font-bold",
                      trade.profit >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {trade.profit >= 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    {fmtPnl(trade.profit)}
                  </p>
                )}
                {trade.canClose && (
                  <Button
                    variant={isLimit ? "secondary" : "danger"}
                    size="sm"
                    className="gap-1"
                    disabled={closingKey === key}
                    onClick={() => void onClose(trade)}
                  >
                    {closingKey === key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                    {isLimit ? "Cancel" : "Close"}
                  </Button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function HistoryTab({
  history,
}: {
  history: UserMt5Terminal["history"]["items"];
}) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
        <History className="mx-auto h-8 w-8 text-gray-600" />
        <p className="mt-3 text-sm text-gray-400">No trade history yet</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {history.map((row) => (
        <li
          key={row.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">{row.symbol}</span>
              <Badge variant={row.direction === "BUY" ? "success" : "danger"}>
                {row.direction}
              </Badge>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  historyStatusClass(row.status),
                )}
              >
                {row.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {new Date(row.closedAt).toLocaleString()}
              {row.exitPrice != null ? ` · exit ${row.exitPrice}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {row.pnl != null ? (
              <p
                className={cn(
                  "text-sm font-semibold",
                  row.pnl >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {fmtPnl(row.pnl)}
              </p>
            ) : (
              <p className="text-xs text-gray-500">—</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
