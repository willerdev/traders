"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Ban,
  ChevronRight,
  Clock,
  History,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  api,
  type OpenSetupItem,
  type UserMt5Terminal,
  type UserMt5Trade,
} from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  const [runningTrades, setRunningTrades] = useState<UserMt5Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("trades");
  const [selectedSetup, setSelectedSetup] = useState<SetupSummary | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const terminal = await api.signals.mt5Terminal();
      setData(terminal);
      setRunningTrades(terminal.trades.filter((t) => t.kind === "running"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load MT5 data");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadRunning = useCallback(async () => {
    try {
      const res = await api.signals.mt5Running();
      setRunningTrades(res.trades);
      setData((prev) =>
        prev
          ? {
              ...prev,
              stats: {
                ...prev.stats,
                runningCount: res.stats.runningCount,
                floatingProfit: res.stats.floatingProfit,
              },
            }
          : prev,
      );
    } catch {
      /* keep last snapshot on poll errors */
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
    void loadRunning();
    const id = window.setInterval(() => void loadRunning(), 2000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, tab, loadRunning]);

  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const setups = data?.setups.items ?? [];
  const history = data?.history.items ?? [];
  const floating = data?.stats.floatingProfit ?? 0;
  const limitCount = data?.stats.limitCount ?? 0;
  const runningCount = data?.stats.runningCount ?? runningTrades.length;

  async function runSetupAction(
    key: string,
    fn: () => Promise<void>,
  ) {
    setActionKey(key);
    setError(null);
    try {
      await fn();
      await load(true);
      if (tab === "trades") await loadRunning();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionKey(null);
    }
  }

  async function handleCloseTrade(trade: UserMt5Trade) {
    if (!confirm(`Close running ${trade.symbol} trade?`)) return;
    const key = trade.signalId ?? trade.positionId ?? trade.symbol;
    await runSetupAction(key, async () => {
      if (trade.signalId) {
        await api.signals.closeTrade(trade.signalId);
      } else if (trade.positionId) {
        await api.signals.closeMt5Position(trade.positionId);
      } else {
        throw new Error("No trade id to close");
      }
    });
  }

  async function handleBreakeven(trade: UserMt5Trade) {
    if (!trade.signalId) return;
    if (
      !confirm(
        "Move stop loss to breakeven (entry)? Retries automatically if the broker rejects.",
      )
    ) {
      return;
    }
    await runSetupAction(`be-${trade.signalId}`, async () => {
      await api.signals.setBreakeven(trade.signalId!);
    });
  }

  async function handlePartialClose(trade: UserMt5Trade, volume: number) {
    if (!trade.signalId) return;
    if (
      !confirm(
        `Partial close ${volume} lot(s) on ${trade.symbol}? Position stays open.`,
      )
    ) {
      return;
    }
    await runSetupAction(`partial-${trade.signalId}`, async () => {
      await api.signals.partialClose(trade.signalId!, volume);
    });
  }

  async function handlePlaceSetup(setup: OpenSetupItem) {
    if (
      !confirm(
        `Place ${setup.direction} ${setup.symbol} on platform MT5 now?\n\nSL ${setup.stopLoss} · TP ${setup.takeProfit}`,
      )
    ) {
      return;
    }
    await runSetupAction(`place-${setup.signalId}`, async () => {
      await api.signals.placeTrade(setup.signalId);
    });
  }

  async function handleInvalidateSetup(setup: OpenSetupItem) {
    if (setup.resolution.canInvalidate === false) {
      setError(
        setup.resolution.invalidateBlockedReason ??
          "Cannot invalidate while a trade is running on this setup.",
      );
      return;
    }
    if (
      !confirm(
        `Invalidate ${setup.symbol} setup? Pending orders will be cancelled.`,
      )
    ) {
      return;
    }
    await runSetupAction(`inv-${setup.signalId}`, async () => {
      await api.signals.invalidate(setup.signalId);
    });
  }

  const tabs: { id: Tab; label: string; icon: typeof Layers; count?: number }[] =
    [
      { id: "setups", label: "Setups", icon: Layers, count: setups.length },
      {
        id: "trades",
        label: "Trades",
        icon: Activity,
        count: runningCount,
      },
      { id: "history", label: "History", icon: History, count: history.length },
    ];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg flex-col md:max-w-2xl">
      <div className="sticky top-0 z-20 border-b border-white/5 bg-[var(--color-surface)]/95 px-4 pb-3 pt-4 backdrop-blur-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-white">MT5</h1>
            <p className="text-xs text-gray-500">
              Setups · limits on platform MT5 · running trades refresh every 2s
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
          <SetupsTab
            setups={setups}
            actionKey={actionKey}
            onSelect={setSelectedSetup}
            onPlace={handlePlaceSetup}
            onInvalidate={handleInvalidateSetup}
          />
        ) : tab === "trades" ? (
          <TradesTab
            trades={runningTrades}
            actionKey={actionKey}
            onClose={handleCloseTrade}
            onBreakeven={handleBreakeven}
            onPartialClose={handlePartialClose}
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
            void loadRunning();
            setSelectedSetup(null);
          }}
        />
      )}
    </div>
  );
}

function SetupsTab({
  setups,
  actionKey,
  onSelect,
  onPlace,
  onInvalidate,
}: {
  setups: OpenSetupItem[];
  actionKey: string | null;
  onSelect: (s: SetupSummary) => void;
  onPlace: (setup: OpenSetupItem) => void;
  onInvalidate: (setup: OpenSetupItem) => void;
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
        const res = setup.resolution;
        const isLimit = live?.status === "pending" || res.executionPhase === "limit_active";
        const isRunning = live?.status === "open" || setup.activated;

        return (
          <li
            key={setup.signalId}
            className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => onSelect(toSetupSummary(setup))}
              className="flex w-full items-center gap-3 p-3 text-left active:bg-white/[0.04]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white">{setup.symbol}</span>
                  <Badge variant={setup.direction === "BUY" ? "success" : "danger"}>
                    {setup.direction}
                  </Badge>
                  {res.executionPhase && (
                    <SetupExecutionBadge
                      phase={res.executionPhase}
                      label={res.executionLabel}
                    />
                  )}
                  {isLimit && !isRunning && (
                    <Badge variant="gold">Limit pending</Badge>
                  )}
                  {isRunning && <Badge variant="success">Running</Badge>}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Entry {setup.entryMin} – {setup.entryMax} · SL {setup.stopLoss}{" "}
                  · TP {setup.takeProfit}
                </p>
                {isRunning && live?.profit != null && (
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

            <div className="flex flex-wrap gap-2 border-t border-white/5 p-2">
              {res.canPlaceTrade && (
                <Button
                  size="sm"
                  className="flex-1 gap-1"
                  disabled={actionKey === `place-${setup.signalId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onPlace(setup);
                  }}
                >
                  {actionKey === `place-${setup.signalId}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Place on MT5
                </Button>
              )}
              {!isRunning && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 gap-1"
                  disabled={
                    actionKey === `inv-${setup.signalId}` || !res.canInvalidate
                  }
                  title={res.invalidateBlockedReason}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onInvalidate(setup);
                  }}
                >
                  {actionKey === `inv-${setup.signalId}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ban className="h-3.5 w-3.5" />
                  )}
                  Invalidate
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TradesTab({
  trades,
  actionKey,
  onClose,
  onBreakeven,
  onPartialClose,
}: {
  trades: UserMt5Trade[];
  actionKey: string | null;
  onClose: (trade: UserMt5Trade) => void;
  onBreakeven: (trade: UserMt5Trade) => void;
  onPartialClose: (trade: UserMt5Trade, volume: number) => void;
}) {
  const [partialLot, setPartialLot] = useState<Record<string, string>>({});
  const [expandedPartial, setExpandedPartial] = useState<string | null>(null);

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
        <Activity className="mx-auto h-8 w-8 text-gray-600" />
        <p className="mt-3 text-sm text-gray-400">No running trades</p>
        <p className="mt-1 text-xs text-gray-600">
          Running positions appear here after a setup fills on platform MT5.
          Limits stay under Setups.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {trades.map((trade) => {
        const key =
          trade.signalId ?? trade.positionId ?? trade.orderId ?? trade.symbol;
        const partialKey = partialLot[key] ?? "";

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
                  <Badge variant="success">Running</Badge>
                  {trade.breakevenSet && (
                    <Badge variant="secondary">BE set</Badge>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                  {trade.openPrice != null && (
                    <span>
                      Open{" "}
                      <span className="text-gray-300">{trade.openPrice}</span>
                    </span>
                  )}
                  {trade.currentPrice != null && (
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
              </div>

              <div className="shrink-0 text-right">
                {trade.profit != null && (
                  <p
                    className={cn(
                      "flex items-center justify-end gap-1 text-lg font-bold",
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
                <p className="mt-0.5 text-[10px] text-gray-600">live · 2s</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {trade.canSetBreakeven && trade.signalId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  disabled={actionKey === `be-${trade.signalId}`}
                  onClick={() => void onBreakeven(trade)}
                >
                  {actionKey === `be-${trade.signalId}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Shield className="h-3.5 w-3.5" />
                  )}
                  Breakeven
                </Button>
              )}
              {trade.canPartialClose && trade.signalId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setExpandedPartial(expandedPartial === key ? null : key)
                  }
                >
                  Partial
                </Button>
              )}
              {trade.canClose && (
                <Button
                  variant="danger"
                  size="sm"
                  className="gap-1"
                  disabled={actionKey === key}
                  onClick={() => void onClose(trade)}
                >
                  {actionKey === key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  Close
                </Button>
              )}
            </div>

            {expandedPartial === key && trade.signalId && (
              <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-white/5 pt-2">
                <Input
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder={`Lot (max ${trade.volume ?? "?"})`}
                  value={partialKey}
                  onChange={(e) =>
                    setPartialLot((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="min-w-[100px] flex-1"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actionKey === `partial-${trade.signalId}`}
                  onClick={() => {
                    const vol = parseFloat(partialKey);
                    if (isNaN(vol) || vol <= 0) return;
                    void onPartialClose(trade, vol);
                    setExpandedPartial(null);
                  }}
                >
                  {actionKey === `partial-${trade.signalId}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Close partial"
                  )}
                </Button>
              </div>
            )}
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
