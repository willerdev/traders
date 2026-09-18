"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  History,
  Loader2,
  ListChecks,
  Pause,
  Play,
  Plus,
  Star,
} from "lucide-react";
import {
  api,
  type OpenSetupItem,
  type UserMt5HistoryItem,
  type UserMt5Trade,
} from "@/lib/api";
import { useAuthStore, useDashboardStore } from "@/stores/auth";
import { canAccessMt5Copy } from "@/lib/copy-access";
import { useMt5Terminal } from "@/hooks/use-mt5-terminal";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { EvaluationStatusCard } from "@/components/evaluations/evaluation-status-card";
import { Button } from "@/components/ui/button";
import {
  SetupDetailModal,
  type SetupSummary,
} from "@/components/dashboard/setup-detail-modal";
import { Mt5Assistant } from "@/components/mt5/mt5-assistant";
import { Mt5LiveSyncCard } from "@/components/mt5/mt5-live-sync-card";
import { Mt5ChartTerminal } from "@/components/mt5/mt5-chart-terminal";
import { Mt5EvaluationAccountPicker } from "@/components/mt5/mt5-evaluation-account-picker";
import { TradingConnectDialog } from "@/components/mt5/trading-connect-dialog";
import { TradingPlaceTradeCard } from "@/components/mt5/trading-place-trade-card";
import { TradingAlertsPanel } from "@/components/mt5/trading-alerts-panel";
import { TradingHistoryPanel } from "@/components/mt5/trading-history-panel";
import { useMt5History } from "@/hooks/use-mt5-history";
import { TradingLiveBalance } from "@/components/mt5/trading-live-balance";
import { Mt5PlaceOrderModal } from "@/components/mt5/mt5-place-order-modal";
import { pickDefaultChartSymbol } from "@/lib/chart-market-status";
import { useChartWatchlist } from "@/components/charts/use-chart-watchlist";
import { usePriceAlertMonitor } from "@/hooks/use-price-alert-monitor";
import { useMetaApiLive } from "@/hooks/use-metaapi-live";
import { setMetaApiHasOpenTrades } from "@/lib/metaapi-live";
import { useMt5ChartDisplaySettings } from "@/hooks/use-mt5-chart-display-settings";
import { cn } from "@/lib/utils";
import { mt5DisplayBalance } from "@/components/mt5/mt5-ui";

type RightTab = "watchlist" | "alerts" | "history" | "setups";

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

export default function Mt5UserPage() {
  const { ready, hasHydrated } = useRequireAuth();
  const userRole = useAuthStore((s) => s.user?.role);
  const adminPermissions = useAuthStore((s) => s.user?.adminPermissions);
  const dashboardPermissions = useDashboardStore(
    (s) => s.data?.user?.adminPermissions,
  );
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);
  const userId = useAuthStore((s) => s.user?.id);
  const [selectedChartSymbol, setSelectedChartSymbol] = useState<string | null>(
    null,
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("alerts");
  const [orderModal, setOrderModal] = useState<"BUY" | "SELL" | null>(null);
  const [lotSize, setLotSize] = useState("0.01");
  const [reviewedHistory, setReviewedHistory] =
    useState<UserMt5HistoryItem | null>(null);
  const [selectedSetup, setSelectedSetup] = useState<SetupSummary | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [evaluationBreached, setEvaluationBreached] = useState(false);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<
    string | null
  >(null);
  const { watchlist, addSymbol } = useChartWatchlist();
  const { live, setPaused, seeLiveData } = useMetaApiLive();
  const { settings: chartDisplaySettings } = useMt5ChartDisplaySettings();

  const effectivePermissions = dashboardPermissions ?? adminPermissions;
  const canManageCopy = canAccessMt5Copy({
    role: userRole,
    adminPermissions: effectivePermissions,
  });

  const {
    data,
    runningTrades,
    quotes,
    loading,
    error,
    setError,
    load,
    loadRunning,
  } = useMt5Terminal(userId, ready, hasHydrated, "chart", ready);

  const refreshEvaluationStatus = useCallback(async () => {
    try {
      const evaluation = await api.evaluations.getActive().catch(() => null);
      setEvaluationBreached(evaluation?.status === "BREACHED");
    } catch {
      setEvaluationBreached(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !hasHydrated) return;
    void fetchDashboard();
  }, [ready, hasHydrated, fetchDashboard]);

  useEffect(() => {
    if (!ready) return;
    void refreshEvaluationStatus();
  }, [ready, refreshEvaluationStatus]);

  useEffect(() => {
    if (data?.selectedEvaluationEnrollmentId) {
      setSelectedEvaluationId(data.selectedEvaluationEnrollmentId);
    }
  }, [data?.selectedEvaluationEnrollmentId]);

  const handleEvaluationSelected = useCallback(
    (enrollmentId: string) => {
      setSelectedEvaluationId(enrollmentId);
      void load({ background: false });
      void loadRunning();
    },
    [load, loadRunning],
  );

  const setups = data?.setups.items ?? [];
  const limitTrades = useMemo(
    () => (data?.trades ?? []).filter((t) => t.kind === "limit"),
    [data?.trades],
  );
  const displayRunningTrades = useMemo(() => {
    const merged = new Map<string, UserMt5Trade>();
    const keyFor = (t: UserMt5Trade) =>
      t.positionId ?? t.orderId ?? `${t.symbol}-${t.openPrice ?? ""}`;
    for (const trade of data?.trades ?? []) {
      if (trade.kind !== "running") continue;
      merged.set(keyFor(trade), trade);
    }
    for (const trade of runningTrades) {
      merged.set(keyFor(trade), trade);
    }
    return [...merged.values()];
  }, [data?.trades, runningTrades]);

  const chartSymbol = useMemo(
    () =>
      selectedChartSymbol ??
      pickDefaultChartSymbol([
        displayRunningTrades[0]?.symbol,
        quotes[0]?.symbol,
        watchlist[0],
      ]),
    [selectedChartSymbol, displayRunningTrades, quotes, watchlist],
  );

  const linked = Boolean(data?.account);
  const needsConnect = !linked && !loading;
  const hasOpenTrades =
    displayRunningTrades.length > 0 || limitTrades.length > 0;
  const runningCount =
    data?.stats.runningCount ?? displayRunningTrades.length;

  useEffect(() => {
    setMetaApiHasOpenTrades(hasOpenTrades);
  }, [hasOpenTrades]);

  const account = data?.account;
  const equity = account?.equity ?? account?.startingBalance ?? 0;
  const walletBalance = account
    ? data?.accountSource === "linked_live"
      ? account.startingBalance + (account.floatingProfit ?? 0)
      : mt5DisplayBalance(account, data?.accountSource)
    : 0;
  const {
    alerts,
    addAlert,
    removeAlert,
    toasts,
    dismissToast,
    lastPrices,
  } = usePriceAlertMonitor(linked);
  const {
    items: historyItems,
    loading: historyLoading,
    error: historyError,
    load: loadHistory,
    dayPnl,
    dealCount: historyDealCount,
  } = useMt5History(userId, linked);

  const lastAlertPrice = useMemo(() => {
    const livePx = lastPrices[chartSymbol.toUpperCase()];
    if (livePx != null) return livePx;
    const q = quotes.find(
      (item) => item.symbol.toUpperCase() === chartSymbol.toUpperCase(),
    );
    return q?.mid ?? q?.bid ?? null;
  }, [quotes, chartSymbol, lastPrices]);

  const handleCloseTrade = useCallback(
    async (trade: UserMt5Trade) => {
      const id = trade.positionId ?? trade.orderId;
      setError(null);
      try {
        if (trade.signalId) {
          await api.signals.closeTrade(trade.signalId);
        } else if (id) {
          await api.signals.closeMt5Position(id);
        } else {
          throw new Error("No trade id to close");
        }
        await load({ background: true });
        await loadRunning();
        window.setTimeout(() => {
          void loadHistory({ fresh: true });
        }, 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not close trade");
      }
    },
    [load, loadRunning, loadHistory, setError],
  );

  async function handleCloseAll() {
    if (runningCount === 0) return;
    if (
      !confirm(
        `Close all ${runningCount} open position(s)? This cannot be undone.`,
      )
    ) {
      return;
    }
    setClosingAll(true);
    setError(null);
    try {
      const result = await api.signals.closeAllMt5Positions();
      await load({ background: true });
      await loadRunning();
      void loadHistory({ fresh: true });
      if (result.failed > 0) {
        setError(
          `Closed ${result.closed}/${result.total}. ${result.failed} failed.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close all");
    } finally {
      setClosingAll(false);
    }
  }

  function afterLinked() {
    void load({ background: false });
    void loadRunning();
    void loadHistory({ fresh: true });
  }

  if (!ready) return <AuthLoadingScreen />;

  if (evaluationBreached) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <EvaluationStatusCard />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 md:px-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Trading
        </h1>
        <Mt5EvaluationAccountPicker
          selectedId={selectedEvaluationId}
          onSelected={handleEvaluationSelected}
          className="max-w-xs"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canManageCopy && (
            <Link href="/mt5/copy">
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                Copy pool
              </Button>
            </Link>
          )}
          {runningCount > 0 && (
            <button
              type="button"
              onClick={() => void handleCloseAll()}
              disabled={closingAll}
              className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-danger hover:bg-white/5 disabled:opacity-50"
            >
              {closingAll ? "…" : "Close all"}
            </button>
          )}
          {linked && !live && (
            <button
              type="button"
              onClick={() => {
                seeLiveData();
                void load({ background: true });
                void loadRunning();
                void loadHistory({ fresh: false });
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-success px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-success/90"
            >
              <Play className="h-3.5 w-3.5" />
              See live data
            </button>
          )}
          {linked && live && (
            <button
              type="button"
              onClick={() => setPaused(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground"
              title="Pause MetaAPI while this tab is open"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          )}
        </div>
      </header>

      <div className="px-4 md:px-5">
        <Mt5LiveSyncCard
          tradingActive
          compact
          onAccountLinked={afterLinked}
        />
      </div>

      {error && (
        <p className="px-4 pb-2 text-sm text-danger md:px-5">{error}</p>
      )}

      <TradingLiveBalance
        equity={equity}
        balance={walletBalance}
        currency={account?.currency ?? "USD"}
        live={live}
        linked={linked}
        floating={account?.floatingProfit ?? 0}
        dayPnl={dayPnl}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-4 pt-3 md:flex-row md:px-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
            {loading && !data ? (
              <div className="flex flex-1 items-center justify-center py-24">
                <Loader2 className="h-7 w-7 animate-spin text-muted" />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <Mt5ChartTerminal
                  quotes={quotes}
                  runningTrades={displayRunningTrades}
                  limitTrades={limitTrades}
                  setups={setups}
                  account={data?.account}
                  accountSource={data?.accountSource}
                  selectedSymbol={chartSymbol}
                  reviewedHistory={reviewedHistory}
                  onSelectSymbol={(sym) => {
                    setReviewedHistory(null);
                    setSelectedChartSymbol(sym);
                    addSymbol(sym);
                  }}
                  onOpenSetup={setSelectedSetup}
                  onCloseTrade={(trade) => void handleCloseTrade(trade)}
                  canManageTrades
                  onStopsUpdated={() => {
                    void load({ background: true });
                    void loadRunning();
                  }}
                  onTradePlaced={() => {
                    void load({ background: true });
                    void loadRunning();
                    void loadHistory({ fresh: true });
                  }}
                  showOrdersPanel={linked}
                  showTradeBar={false}
                  workspaceLayout
                />
              </div>
            )}

            {needsConnect && (
              <div className="border-t border-border px-4 py-8 text-center sm:px-8">
                <h2 className="text-lg font-semibold text-foreground">
                  Connect your trading account before you trade
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
                  Link a live MT5 account or pick an evaluation from the header.
                  Once connected, you can trade from this workspace.
                </p>
                <button
                  type="button"
                  onClick={() => setConnectOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Connect Trading Account
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="flex min-h-0 w-full shrink-0 flex-col gap-3 overflow-hidden md:h-full md:w-[22rem]">
          <TradingPlaceTradeCard
            linked={linked}
            canTrade
            lotSize={lotSize}
            onLotSizeChange={setLotSize}
            onAdjustLot={(delta) => {
              setLotSize((prev) => {
                const next = Math.max(0.01, Number(prev) + delta);
                if (!Number.isFinite(next)) return "0.01";
                return next.toFixed(2);
              });
            }}
            onBuy={() => setOrderModal("BUY")}
            onSell={() => setOrderModal("SELL")}
            onNeedConnect={() => setConnectOpen(true)}
          />
          <div className="flex max-h-[min(28rem,50dvh)] min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface md:max-h-none">
            <div className="flex border-b border-border text-xs font-medium">
              {(
                [
                  ["watchlist", "Watch", Star],
                  ["alerts", "Alerts", Bell],
                  ["history", "History", History],
                  ["setups", "Setups", ListChecks],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRightTab(id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 px-1 py-2.5",
                    rightTab === id
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
              {rightTab === "watchlist" && (
                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
                  {watchlist.map((sym) => (
                    <li key={sym}>
                      <button
                        type="button"
                        onClick={() => {
                          setReviewedHistory(null);
                          setSelectedChartSymbol(sym);
                        }}
                        className={cn(
                          "w-full rounded-lg px-3 py-2 text-left text-sm",
                          chartSymbol === sym
                            ? "bg-primary/15 font-semibold text-primary"
                            : "text-foreground/80 hover:bg-navy/60",
                        )}
                      >
                        {sym}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {rightTab === "alerts" && (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <TradingAlertsPanel
                    symbol={chartSymbol}
                    lastPrice={lastAlertPrice}
                    linked={linked}
                    alerts={alerts}
                    toasts={toasts}
                    onAdd={addAlert}
                    onRemove={removeAlert}
                    onDismissToast={dismissToast}
                  />
                </div>
              )}
              {rightTab === "history" && (
                <div className="min-h-0 flex-1">
                  <TradingHistoryPanel
                    items={historyItems}
                    loading={historyLoading}
                    error={historyError}
                    dealCount={historyDealCount}
                    selectedId={reviewedHistory?.id ?? null}
                    onSelect={(item) => {
                      setReviewedHistory(item);
                      setSelectedChartSymbol(item.symbol);
                      addSymbol(item.symbol);
                    }}
                  />
                </div>
              )}
              {rightTab === "setups" && (
                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {setups.length === 0 ? (
                    <li className="px-1 py-8 text-center text-xs text-muted">
                      No open setups
                    </li>
                  ) : (
                    setups.map((setup) => (
                      <li key={setup.signalId}>
                        <button
                          type="button"
                          onClick={() => setSelectedSetup(toSetupSummary(setup))}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-navy/60"
                        >
                          <span className="font-semibold">{setup.symbol}</span>{" "}
                          <span className="text-muted">{setup.direction}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>
        </aside>
      </div>

      {orderModal && (
        <Mt5PlaceOrderModal
          symbol={chartSymbol}
          direction={orderModal}
          volume={
            Number.isFinite(Number(lotSize)) && Number(lotSize) >= 0.01
              ? Number(lotSize)
              : undefined
          }
          open
          onClose={() => setOrderModal(null)}
          onPlaced={() => {
            setOrderModal(null);
            void load({ background: true });
            void loadRunning();
            void loadHistory({ fresh: true });
          }}
        />
      )}

      {selectedSetup && (
        <SetupDetailModal
          setup={selectedSetup}
          onClose={() => setSelectedSetup(null)}
          onUpdated={() => {
            void load({ background: true });
            void loadRunning();
            setSelectedSetup(null);
          }}
        />
      )}

      {chartDisplaySettings.showAssistant && (
        <Mt5Assistant
          onActionsTaken={() => {
            void load({ background: true });
            void loadRunning();
          }}
        />
      )}

      <TradingConnectDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onLinked={afterLinked}
      />
    </div>
  );
}
