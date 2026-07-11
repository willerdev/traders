"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Loader2,
} from "lucide-react";
import {
  api,
  type OpenSetupItem,
  type UserMt5HistoryItem,
  type UserMt5QuoteItem,
  type UserMt5Trade,
} from "@/lib/api";
import { useAuthStore, useDashboardStore } from "@/stores/auth";
import { canAccessMt5Copy } from "@/lib/copy-access";
import { useMt5Terminal } from "@/hooks/use-mt5-terminal";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { useUrlTab } from "@/hooks/use-url-tab";
import { hasTradingAccess } from "@/lib/trading-access";
import { cn, formatCurrency } from "@/lib/utils";
import { WeeklyAccessGate } from "@/components/payments/weekly-access-gate";
import { EvaluationStatusCard } from "@/components/evaluations/evaluation-status-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SetupDetailModal,
  type SetupSummary,
} from "@/components/dashboard/setup-detail-modal";
import {
  Mt5AccountModeBadge,
  Mt5AccountSummary,
  Mt5ActionStrip,
  Mt5DetailGrid,
  Mt5DirectionTag,
  Mt5Empty,
  Mt5ExpandableRow,
  Mt5Pnl,
  Mt5QuotePrice,
  Mt5SubTabs,
  Mt5SummaryBlock,
  fmtMt5Date,
  fmtMt5Price,
  fmtQuoteTime,
  rowKey,
  useMt5Expand,
} from "@/components/mt5/mt5-ui";
import { Mt5Assistant } from "@/components/mt5/mt5-assistant";
import { useMt5ChartDisplaySettings } from "@/hooks/use-mt5-chart-display-settings";
import { Mt5LiveSyncCard } from "@/components/mt5/mt5-live-sync-card";
import { Mt5ChartTerminal } from "@/components/mt5/mt5-chart-terminal";
import { Mt5EvaluationAccountPicker } from "@/components/mt5/mt5-evaluation-account-picker";
import { Mt5SwipeableRow } from "@/components/mt5/mt5-swipeable-row";
import {
  Mt5MobileBottomNav,
  type Mt5MobileTab,
} from "@/components/mt5/mt5-mobile-bottom-nav";
import { DEFAULT_CHART_SYMBOL } from "@/components/charts/chart-types";
import {
  mt5AccountModeDetail,
  mt5AccountModeFromSource,
} from "@/lib/mt5-account-mode";

type Tab = "quotes" | "chart" | "trades" | "history" | "setups";
type HistorySubTab = "positions" | "orders" | "deals";

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

function orderStatus(row: UserMt5HistoryItem): "FILLED" | "CANCELED" {
  if (row.status === "CANCELLED") return "CANCELED";
  return "FILLED";
}

function orderTypeLabel(row: UserMt5HistoryItem) {
  const dir = row.direction.toLowerCase();
  if (row.entryPrice == null && row.status === "CANCELLED") {
    return `${dir} limit`;
  }
  if (row.entryPrice != null) return dir;
  return `${dir} limit`;
}

export default function Mt5UserPage() {
  const { ready, hasHydrated } = useRequireAuth();
  const userRole = useAuthStore((s) => s.user?.role);
  const adminPermissions = useAuthStore((s) => s.user?.adminPermissions);
  const dashboardPermissions = useDashboardStore((s) => s.data?.user?.adminPermissions);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);
  const userId = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useUrlTab("tab", "chart", [
    "quotes",
    "chart",
    "setups",
    "trades",
    "history",
  ] as const);
  const [historySubTab, setHistorySubTab] = useUrlTab("history", "positions", [
    "positions",
    "orders",
    "deals",
  ] as const);
  const [selectedSetup, setSelectedSetup] = useState<SetupSummary | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [tradingAccess, setTradingAccess] = useState<boolean | null>(null);
  const [evaluationBreached, setEvaluationBreached] = useState(false);
  const [hadPaidBefore, setHadPaidBefore] = useState(false);
  const [selectedChartSymbol, setSelectedChartSymbol] = useState<string | null>(
    null,
  );
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<
    string | null
  >(null);
  const { settings: chartDisplaySettings } = useMt5ChartDisplaySettings();

  const refreshTradingAccess = useCallback(async () => {
    try {
      const [dash, evaluation] = await Promise.all([
        api.users.dashboard(),
        api.evaluations.getActive().catch(() => null),
      ]);
      setTradingAccess(dash?.user ? hasTradingAccess(dash.user) : false);
      setHadPaidBefore(Boolean(dash?.user?.registrationPaid));
      setEvaluationBreached(evaluation?.status === "BREACHED");
    } catch {
      setTradingAccess(false);
    }
  }, []);

  const accessGranted = tradingAccess === true;
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
    refreshing,
    error,
    setError,
    load,
    loadRunning,
  } = useMt5Terminal(userId, ready, hasHydrated, tab, accessGranted);

  useEffect(() => {
    if (!ready || !hasHydrated) return;
    void fetchDashboard();
  }, [ready, hasHydrated, fetchDashboard]);

  useEffect(() => {
    if (!ready) return;
    void refreshTradingAccess();
  }, [ready, refreshTradingAccess]);

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
  const history = data?.history.items ?? [];
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
  const floating = data?.stats.floatingProfit ?? 0;
  const account = data?.account;
  const accountSource = data?.accountSource;
  const investor = data?.investor;
  const accountMode = mt5AccountModeFromSource(accountSource, investor);
  const accountModeDetail =
    mt5AccountModeDetail(accountSource) ??
    (accountMode === "real" && investor?.investmentDeposited
      ? "Investor"
      : null);
  const limitCount = data?.stats.limitCount ?? 0;
  const runningCount = data?.stats.runningCount ?? displayRunningTrades.length;

  const chartSymbol =
    selectedChartSymbol ??
    displayRunningTrades[0]?.symbol ??
    quotes[0]?.symbol ??
    DEFAULT_CHART_SYMBOL;

  const historyPositions = useMemo(
    () => history.filter((h) => h.status === "WON" || h.status === "LOST"),
    [history],
  );
  const historyOrders = useMemo(
    () => history,
    [history],
  );
  const historyProfit = useMemo(
    () =>
      history.reduce((sum, h) => sum + (h.pnl ?? 0), 0),
    [history],
  );

  async function runSetupAction(key: string, fn: () => Promise<void>) {
    setActionKey(key);
    setError(null);
    try {
      await fn();
      await load({ background: true });
      if (tab === "trades") await loadRunning();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionKey(null);
    }
  }

  async function handleCloseTrade(trade: UserMt5Trade) {
    if (!confirm(`Close running ${trade.symbol} position?`)) return;
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

  function refreshAfterAssistant() {
    void load({ background: true });
    void loadRunning();
  }

  async function openSetupFromHistory(row: UserMt5HistoryItem) {
    setHistoryLoadingId(row.signalId);
    setError(null);
    try {
      let screenshotUrl: string | undefined;
      try {
        const full = await api.signals.get(row.signalId);
        screenshotUrl = full.screenshotUrl;
      } catch {
        /* chart optional */
      }
      setSelectedSetup({
        signalId: row.signalId,
        symbol: row.symbol,
        direction: row.direction,
        entryMin: row.entryMin,
        entryMax: row.entryMax,
        stopLoss: row.stopLoss,
        takeProfit: row.takeProfit,
        status: row.status,
        submittedAt: row.submittedAt,
        screenshotUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load setup");
    } finally {
      setHistoryLoadingId(null);
    }
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

  if (!ready) {
    return <AuthLoadingScreen />;
  }

  if (tradingAccess === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tradingAccess) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <WeeklyAccessGate
          renewal={hadPaidBefore}
          onComplete={() => {
            void refreshTradingAccess();
          }}
          title={hadPaidBefore ? "Renew to use MT5" : "Pay to unlock MT5"}
          description="MT5 quotes, setups, and live trading require an active weekly pass (7 days per payment)."
        />
      </div>
    );
  }

  if (evaluationBreached) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <EvaluationStatusCard />
      </div>
    );
  }

  const mainTabs: { id: Tab; label: string; count?: number }[] = [
    { id: "quotes", label: "Quotes", count: quotes.length },
    { id: "setups", label: "Setups", count: setups.length },
    { id: "trades", label: "Trade", count: runningCount },
  ];

  const headerTitle =
    tab === "history"
      ? "History"
      : tab === "trades"
        ? "Trade"
        : tab === "chart"
          ? "Charts"
          : tab === "quotes"
            ? "Quotes"
            : "Setups";

  const mobileTab: Mt5MobileTab =
    tab === "quotes" ||
    tab === "chart" ||
    tab === "trades" ||
    tab === "history"
      ? tab
      : "quotes";

  const setMobileTab = (next: Mt5MobileTab) => setTab(next);

  return (
    <div
      className={cn(
        "mt5-shell flex w-full max-w-lg flex-col bg-[var(--mt5-bg)] text-[var(--mt5-text)]",
        "min-h-[calc(100dvh-env(safe-area-inset-bottom,0px))]",
        "max-md:pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]",
        "md:min-h-[calc(100dvh-1rem)] md:max-w-none md:mx-0 md:pb-0",
        tab === "trades" &&
          "md:h-[calc(100dvh-0.5rem)] md:max-h-[calc(100dvh-0.5rem)] md:min-h-0 md:overflow-hidden md:flex-1",
        tab === "chart" &&
          "max-md:h-[calc(100dvh-env(safe-area-inset-bottom,0px))] max-md:overflow-hidden max-md:pb-0",
        tab === "chart" &&
          "md:h-[calc(100dvh-0.5rem)] md:max-h-[calc(100dvh-0.5rem)] md:min-h-0 md:overflow-hidden md:flex-1",
      )}
    >
      <div className={cn("md:hidden", tab === "chart" && "max-md:hidden")}>
        <Mt5LiveSyncCard tradingActive compact />
      </div>
      {/* MT5-style header — hidden on desktop chart (Trade tab) and mobile Charts tab */}
      <div
      className={cn(
        "sticky top-0 z-20 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)]",
        tab === "trades" && "md:hidden",
        tab === "chart" && "hidden",
      )}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {tab === "history" && (
              <button
                type="button"
                onClick={() => setTab("trades")}
                className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)] hover:text-[var(--mt5-text)] md:flex"
                aria-label="Back to Trade"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold">{headerTitle}</h1>
                <Mt5AccountModeBadge
                  mode={accountMode}
                  detail={accountModeDetail}
                />
              </div>
              <p className="text-xs text-[var(--mt5-muted)]">
                {tab === "quotes" ? "Your open setups · 1s" : "All symbols"}
                {refreshing && (
                  <span className="ml-2 text-[10px] text-primary">· syncing</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canManageCopy && (
              <Link href="/mt5/copy">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[10px] text-[var(--mt5-muted)]"
                >
                  Copy pool
                </Button>
              </Link>
            )}
            {tab === "trades" && runningCount > 0 && (
              <button
                type="button"
                onClick={() => void handleCloseAll()}
                disabled={closingAll || refreshing}
                className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#ff5252] hover:bg-[var(--mt5-row-hover)] disabled:opacity-50"
              >
                {closingAll ? "…" : "Close all"}
              </button>
            )}
            {tab === "trades" && (
              <button
                type="button"
                onClick={() => setTab("history")}
                className="hidden rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary hover:bg-[var(--mt5-row-hover)] md:inline"
              >
                History
              </button>
            )}
            <button
              type="button"
              onClick={() => void load({ background: Boolean(data) })}
              disabled={refreshing}
              className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)] hover:text-[var(--mt5-text)] disabled:opacity-50"
            >
              {refreshing ? "…" : "Refresh"}
            </button>
          </div>
        </div>

        {account && tab !== "quotes" && (
          <div className={tab === "trades" ? "md:hidden" : undefined}>
            <Mt5AccountSummary
              account={account}
              investor={investor}
              accountSource={accountSource}
            />
          </div>
        )}

        {!account && investor && investor.investmentDeposited > 0 && tab !== "quotes" && (
          <div className={tab === "trades" ? "md:hidden" : undefined}>
            <Mt5SummaryBlock
              rows={[
                {
                  label: "Investment",
                  value: formatCurrency(investor.investmentDeposited),
                },
                ...(investor.mt5Balance != null
                  ? [
                      {
                        label: "MT5 balance",
                        value: `${fmtMt5Price(investor.mt5Balance)} ${investor.currency}`,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        )}

        {tab === "trades" && runningCount > 0 && !account && (
          <div className="md:hidden">
            <Mt5SummaryBlock
            rows={[
              { label: "Positions", value: String(runningCount) },
              {
                label: "Floating",
                value: fmtMt5Price(floating),
                color: floating >= 0 ? "#4a9eff" : "#ff5252",
              },
            ]}
          />
          </div>
        )}

        {tab === "history" && history.length > 0 && !account && (
          <Mt5SummaryBlock
            rows={[
              {
                label: "Profit",
                value: fmtMt5Price(historyProfit),
                color: historyProfit >= 0 ? "#4a9eff" : "#ff5252",
              },
              {
                label: "Closed",
                value: String(history.length),
              },
              {
                label: "Wins",
                value: String(
                  history.filter((h) => h.status === "WON").length,
                ),
                color: "#4a9eff",
              },
              {
                label: "Losses",
                value: String(
                  history.filter((h) => h.status === "LOST").length,
                ),
                color: "#ff5252",
              },
            ]}
          />
        )}

        {tab === "setups" && !account && (
          <Mt5SummaryBlock
            rows={[
              { label: "Open setups", value: String(setups.length) },
              { label: "Limits on MT5", value: String(limitCount) },
            ]}
          />
        )}

        {data?.message && (
          <p className="mx-4 mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-200">
            {data.message}
          </p>
        )}

        {tab !== "history" && (
          <div className="hidden md:block">
            <Mt5SubTabs
              tabs={mainTabs.map((t) => ({ id: t.id, label: t.label.toUpperCase() }))}
              active={tab === "chart" ? "trades" : tab}
              onChange={setTab}
            />
          </div>
        )}

        {tab === "history" && (
          <Mt5SubTabs
            tabs={[
              { id: "positions" as const, label: "POSITIONS" },
              { id: "orders" as const, label: "ORDERS" },
              { id: "deals" as const, label: "DEALS" },
            ]}
            active={historySubTab}
            onChange={setHistorySubTab}
          />
        )}
      </div>

      {(tab === "chart" || tab === "trades") && (
        <div
          className={cn(
            "flex min-h-0 flex-col overflow-hidden",
            tab === "chart" && "h-full flex-1 max-md:min-h-0",
            tab === "trades" && "hidden md:flex md:min-h-0 md:flex-1",
            tab === "chart" && "md:flex md:min-h-0 md:flex-1",
          )}
        >
          <Mt5EvaluationAccountPicker
            selectedId={selectedEvaluationId}
            onSelected={handleEvaluationSelected}
          />
          <Mt5ChartTerminal
            quotes={quotes}
            runningTrades={displayRunningTrades}
            limitTrades={limitTrades}
            setups={setups}
            account={account}
            accountSource={accountSource}
            investor={investor}
            selectedSymbol={chartSymbol}
            onSelectSymbol={setSelectedChartSymbol}
            onOpenSetup={setSelectedSetup}
            onCloseTrade={handleCloseTrade}
            showOrdersPanel={tab === "trades" || tab === "chart"}
            chartOnly={tab === "chart"}
            onStopsUpdated={() => {
              void loadRunning();
              void load({ background: true });
            }}
            onTradePlaced={() => {
              void loadRunning();
              void load({ background: true });
            }}
          />
        </div>
      )}

      {error && (
        <p className="mx-4 mt-3 rounded border border-[#ff5252]/30 bg-[#ff5252]/10 px-3 py-2 text-xs text-[#ff5252]">
          {error}
        </p>
      )}

      <div
        className={cn(
          "flex-1 overflow-y-auto transition-opacity duration-200",
          refreshing && "opacity-[0.92]",
          tab === "trades" && "md:hidden",
          tab === "chart" && "hidden",
        )}
      >
        {loading && !data && tab !== "quotes" ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--mt5-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-xs">Loading MT5…</span>
          </div>
        ) : tab === "quotes" ? (
          <QuotesPanel
            quotes={quotes}
            setups={setups}
            onOpenSetup={(s) => setSelectedSetup(toSetupSummary(s))}
          />
        ) : tab === "setups" ? (
          <SetupsPanel
            setups={setups}
            limitTrades={limitTrades}
            actionKey={actionKey}
            onOpenSetup={(s) => setSelectedSetup(toSetupSummary(s))}
            onPlace={handlePlaceSetup}
            onInvalidate={handleInvalidateSetup}
          />
        ) : tab === "trades" ? (
          <PositionsPanel
            trades={displayRunningTrades}
            actionKey={actionKey}
            onClose={handleCloseTrade}
            onViewChart={(trade) => {
              setSelectedChartSymbol(trade.symbol);
              setTab("chart");
            }}
          />
        ) : tab === "history" ? (
          <HistoryPanel
            subTab={historySubTab}
            positions={historyPositions}
            orders={historyOrders}
            deals={history}
            loadingSignalId={historyLoadingId}
            onOpenSetup={(row) => void openSetupFromHistory(row)}
          />
        ) : null}
      </div>

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
        <Mt5Assistant onActionsTaken={refreshAfterAssistant} />
      )}

      <div className="md:hidden">
        <Mt5MobileBottomNav
          active={mobileTab}
          onChange={setMobileTab}
          badges={{ trades: runningCount > 0 ? runningCount : undefined }}
        />
      </div>
    </div>
  );
}

function QuotesPanel({
  quotes,
  setups,
  onOpenSetup,
}: {
  quotes: UserMt5QuoteItem[];
  setups: OpenSetupItem[];
  onOpenSetup: (s: OpenSetupItem) => void;
}) {
  const sessionExtremes = useRef<Record<string, { low: number; high: number }>>(
    {},
  );

  useEffect(() => {
    for (const q of quotes) {
      if (q.mid == null) continue;
      const prev = sessionExtremes.current[q.symbol];
      if (!prev) {
        sessionExtremes.current[q.symbol] = { low: q.mid, high: q.mid };
      } else {
        sessionExtremes.current[q.symbol] = {
          low: Math.min(prev.low, q.mid),
          high: Math.max(prev.high, q.mid),
        };
      }
    }
  }, [quotes]);

  if (quotes.length === 0) {
    return (
      <Mt5Empty
        title="No quotes"
        hint="Submit an open setup to see live prices here · 1s refresh"
      />
    );
  }

  return (
    <div>
      {quotes.map((q) => {
        const change = q.change ?? 0;
        const changePct = q.changePct ?? 0;
        const up = change >= 0;
        const extremes = sessionExtremes.current[q.symbol];
        const setup = setups.find((s) => s.signalId === q.signalId);

        return (
          <button
            key={q.signalId}
            type="button"
            onClick={() => setup && onOpenSetup(setup)}
            className="flex w-full gap-3 border-b border-[var(--mt5-divider)] px-4 py-3 text-left transition-colors hover:bg-[var(--mt5-row-hover)] active:bg-[var(--mt5-row-hover)]"
          >
            <div className="min-w-0 flex-1">
              <p
                className="text-xs tabular-nums"
                style={{ color: up ? "#4a9eff" : "#ff5252" }}
              >
                {up ? "+" : ""}
                {fmtMt5Price(change)} {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </p>
              <p className="mt-0.5 text-lg font-bold tracking-tight">
                {q.symbol}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--mt5-muted)]">
                <span>{fmtQuoteTime(q.time)}</span>
                {q.spread != null && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">
                      {q.spread.toFixed(q.spread < 1 ? 5 : 2)}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="flex items-baseline justify-end gap-3">
                <Mt5QuotePrice value={q.bid} />
                <Mt5QuotePrice value={q.ask} />
              </div>
              {extremes && (
                <p className="mt-1 text-[10px] tabular-nums text-[var(--mt5-muted)]">
                  L: {fmtMt5Price(extremes.low)} H: {fmtMt5Price(extremes.high)}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SetupsPanel({
  setups,
  limitTrades,
  actionKey,
  onOpenSetup,
  onPlace,
  onInvalidate,
}: {
  setups: OpenSetupItem[];
  limitTrades: UserMt5Trade[];
  actionKey: string | null;
  onOpenSetup: (s: OpenSetupItem) => void;
  onPlace: (s: OpenSetupItem) => void;
  onInvalidate: (s: OpenSetupItem) => void;
}) {
  const expand = useMt5Expand();

  if (setups.length === 0 && limitTrades.length === 0) {
    return (
      <Mt5Empty
        title="No open setups"
        hint="Submit a setup to place limits on platform MT5"
      />
    );
  }

  return (
    <div>
      {limitTrades.map((order, index) => {
        const id = rowKey(
          [order.orderId, order.signalId, `limit-${order.symbol}`],
          index,
        );
        const expanded = expand.isExpanded(id);
        return (
          <Mt5ExpandableRow
            key={id}
            id={id}
            expanded={expanded}
            onToggle={() => expand.toggle(id)}
            header={
              <>
                <div>
                  <span className="font-semibold">{order.symbol}</span>
                  <span className="ml-2">
                    <Mt5DirectionTag
                      direction={order.direction}
                      volume={order.volume}
                      suffix="limit"
                    />
                  </span>
                </div>
                <span className="shrink-0 text-xs text-[var(--mt5-muted)]">
                  pending
                </span>
              </>
            }
            subheader={
              <>
                {order.volume?.toFixed(2) ?? "—"} / {order.volume?.toFixed(2) ?? "—"}{" "}
                at {fmtMt5Price(order.openPrice ?? order.entryMin)}
              </>
            }
            actions={
              order.signalId ? (
                <Mt5ActionStrip
                  actions={[
                    {
                      key: "setup",
                      label: "Setup",
                      variant: "buy",
                      onClick: () => {
                        const s = setups.find(
                          (x) => x.signalId === order.signalId,
                        );
                        if (s) onOpenSetup(s);
                      },
                    },
                  ]}
                />
              ) : undefined
            }
          >
            <Mt5DetailGrid
              left={[
                {
                  label: "S / L:",
                  value: fmtMt5Price(order.stopLoss),
                },
                {
                  label: "T / P:",
                  value: fmtMt5Price(order.takeProfit),
                },
              ]}
              right={[
                {
                  label: "Entry zone:",
                  value: `${fmtMt5Price(order.entryMin)} – ${fmtMt5Price(order.entryMax)}`,
                },
                {
                  label: "Order:",
                  value: order.orderId ? `#${order.orderId}` : "—",
                },
              ]}
            />
          </Mt5ExpandableRow>
        );
      })}

      {setups.map((setup) => {
        const id = setup.signalId;
        const expanded = expand.isExpanded(id);
        const res = setup.resolution;
        const isRunning =
          setup.liveTrade?.status === "open" || setup.activated;

        return (
          <Mt5ExpandableRow
            key={id}
            id={id}
            expanded={expanded}
            onToggle={() => expand.toggle(id)}
            header={
              <>
                <div>
                  <span className="font-semibold">{setup.symbol}</span>
                  <span className="ml-2">
                    <Mt5DirectionTag direction={setup.direction} />
                  </span>
                </div>
                {setup.liveTrade?.profit != null && (
                  <Mt5Pnl value={setup.liveTrade.profit} className="text-base" />
                )}
              </>
            }
            subheader={
              <>
                Entry {fmtMt5Price(setup.entryMin)} – {fmtMt5Price(setup.entryMax)}
              </>
            }
            actions={
              <Mt5ActionStrip
                actions={[
                  ...(res.canPlaceTrade
                    ? [
                        {
                          key: "place",
                          label: "Place",
                          variant: "buy" as const,
                          loading: actionKey === `place-${setup.signalId}`,
                          onClick: () => void onPlace(setup),
                        },
                      ]
                    : []),
                  ...(!isRunning
                    ? [
                        {
                          key: "inv",
                          label: "Cancel",
                          variant: "sell" as const,
                          loading: actionKey === `inv-${setup.signalId}`,
                          disabled: !res.canInvalidate,
                          onClick: () => void onInvalidate(setup),
                        },
                      ]
                    : []),
                  {
                    key: "setup",
                    label: "Setup",
                    variant: "neutral",
                    onClick: () => onOpenSetup(setup),
                  },
                ]}
              />
            }
          >
            <Mt5DetailGrid
              left={[
                { label: "S / L:", value: fmtMt5Price(setup.stopLoss) },
                { label: "T / P:", value: fmtMt5Price(setup.takeProfit) },
              ]}
              right={[
                {
                  label: "Setup:",
                  value: `#${setup.signalId.slice(0, 8)}`,
                },
                {
                  label: "Submitted:",
                  value: fmtMt5Date(setup.submittedAt),
                },
              ]}
            />
          </Mt5ExpandableRow>
        );
      })}
    </div>
  );
}

function PositionsPanel({
  trades,
  actionKey,
  onClose,
  onViewChart,
}: {
  trades: UserMt5Trade[];
  actionKey: string | null;
  onClose: (t: UserMt5Trade) => void;
  onViewChart: (t: UserMt5Trade) => void;
}) {
  const expand = useMt5Expand();

  if (trades.length === 0) {
    return (
      <Mt5Empty
        title="No open positions"
        hint="Running trades from your setups appear here · refreshes every 1s"
      />
    );
  }

  return (
    <div>
      <div className="border-b border-[var(--mt5-divider)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
        Positions
      </div>
      {trades.map((trade, index) => {
        const key = rowKey(
          [trade.positionId, trade.orderId, trade.signalId, trade.symbol],
          index,
        );
        const expanded = expand.isExpanded(key);
        const profit = trade.profit ?? 0;

        const swipeActions = [
          ...(trade.canClose
            ? [
                {
                  key: "close",
                  label: "Close",
                  tone: "danger" as const,
                  disabled: actionKey === key,
                  onClick: () => void onClose(trade),
                },
              ]
            : []),
          {
            key: "chart",
            label: "View chart",
            tone: "primary" as const,
            onClick: () => onViewChart(trade),
          },
        ];

        return (
          <Mt5SwipeableRow key={key} actions={swipeActions}>
          <Mt5ExpandableRow
            id={key}
            expanded={expanded}
            onToggle={() => expand.toggle(key)}
            header={
              <>
                <div>
                  <span className="font-semibold">{trade.symbol}</span>
                  <span className="text-[var(--mt5-muted)]"> · </span>
                  <Mt5DirectionTag
                    direction={trade.direction}
                    volume={trade.volume}
                  />
                  {trade.volume != null && (
                    <span className="ml-1 text-[10px] text-[var(--mt5-muted)]">
                      {trade.volume.toFixed(2)} lot
                    </span>
                  )}
                </div>
                <Mt5Pnl value={profit} className="text-base font-semibold" />
              </>
            }
            subheader={
              <>
                <span>
                  {fmtMt5Price(trade.openPrice)} →{" "}
                  <span className="font-medium text-[var(--mt5-text)]">
                    {fmtMt5Price(trade.currentPrice ?? trade.openPrice)}
                  </span>
                </span>
                {(trade.stopLoss != null || trade.takeProfit != null) && (
                  <span className="mt-0.5 block text-[10px] text-[var(--mt5-muted)]">
                    SL {fmtMt5Price(trade.stopLoss)} · TP{" "}
                    {fmtMt5Price(trade.takeProfit)}
                  </span>
                )}
              </>
            }
            actions={
              <Mt5ActionStrip
                actions={[
                  ...(trade.canClose
                    ? [
                        {
                          key: "close",
                          label: "Close",
                          variant: "sell" as const,
                          loading: actionKey === key,
                          onClick: () => void onClose(trade),
                        },
                      ]
                    : []),
                  {
                    key: "chart",
                    label: "View chart",
                    variant: "buy" as const,
                    onClick: () => onViewChart(trade),
                  },
                ]}
              />
            }
          >
            <Mt5DetailGrid
              left={[
                {
                  label: "",
                  value: trade.positionId
                    ? `#${trade.positionId}`
                    : trade.signalId
                      ? `#${trade.signalId.slice(0, 10)}`
                      : "—",
                },
                { label: "S / L:", value: fmtMt5Price(trade.stopLoss) },
                { label: "T / P:", value: fmtMt5Price(trade.takeProfit) },
              ]}
              right={[
                {
                  label: "Open:",
                  value: fmtMt5Date(new Date().toISOString()),
                },
                { label: "Swap:", value: "0.00" },
                ...(trade.breakevenSet
                  ? [{ label: "BE:", value: "set" }]
                  : []),
              ]}
            />
          </Mt5ExpandableRow>
          </Mt5SwipeableRow>
        );
      })}
    </div>
  );
}

function HistoryPanel({
  subTab,
  positions,
  orders,
  deals,
  loadingSignalId,
  onOpenSetup,
}: {
  subTab: HistorySubTab;
  positions: UserMt5HistoryItem[];
  orders: UserMt5HistoryItem[];
  deals: UserMt5HistoryItem[];
  loadingSignalId: string | null;
  onOpenSetup: (row: UserMt5HistoryItem) => void;
}) {
  const expand = useMt5Expand();

  if (subTab === "positions") {
    if (positions.length === 0) {
      return (
        <Mt5Empty
          title="No closed positions yet"
          hint="Closed setup trades appear here after you close from Trade tab"
        />
      );
    }
    return (
      <div>
        {positions.map((row) => {
          const id = row.id;
          const expanded = expand.isExpanded(id);
          const pnl = row.pnl ?? 0;
          return (
            <Mt5ExpandableRow
              key={id}
              id={id}
              expanded={expanded}
              onToggle={() => expand.toggle(id)}
              header={
                <>
                  <div>
                    <span className="font-semibold">{row.symbol}</span>
                    <span className="text-[var(--mt5-muted)]">, </span>
                    <Mt5DirectionTag direction={row.direction} volume={0.01} />
                  </div>
                  <Mt5Pnl value={pnl} className="text-base" />
                </>
              }
              subheader={
                <>
                  {fmtMt5Price(row.entryPrice)} → {fmtMt5Price(row.exitPrice)}
                </>
              }
              actions={
                <Mt5ActionStrip
                  actions={[
                    {
                      key: "setup",
                      label: loadingSignalId === row.signalId ? "…" : "Setup",
                      variant: "buy",
                      loading: loadingSignalId === row.signalId,
                      onClick: () => onOpenSetup(row),
                    },
                  ]}
                />
              }
            >
              <Mt5DetailGrid
                left={[
                  { label: "", value: `#${row.signalId.slice(0, 10)}` },
                  { label: "S / L:", value: fmtMt5Price(row.stopLoss) },
                  { label: "T / P:", value: fmtMt5Price(row.takeProfit) },
                ]}
                right={[
                  { label: "Open:", value: fmtMt5Date(row.submittedAt) },
                  { label: "Close:", value: fmtMt5Date(row.closedAt) },
                  {
                    label: "Status:",
                    value: row.status,
                  },
                ]}
              />
            </Mt5ExpandableRow>
          );
        })}
      </div>
    );
  }

  if (subTab === "orders") {
    const filled = orders.filter((o) => orderStatus(o) === "FILLED").length;
    const canceled = orders.filter((o) => orderStatus(o) === "CANCELED").length;

    if (orders.length === 0) {
      return <Mt5Empty title="No orders in history" />;
    }

    return (
      <div>
        <Mt5SummaryBlock
          rows={[
            { label: "Filled", value: String(filled), color: "#4a9eff" },
            { label: "Canceled", value: String(canceled) },
            { label: "Total", value: String(orders.length) },
          ]}
        />
        {orders.map((row) => {
          const id = `ord-${row.id}`;
          const expanded = expand.isExpanded(id);
          const status = orderStatus(row);
          return (
            <Mt5ExpandableRow
              key={id}
              id={id}
              expanded={expanded}
              onToggle={() => expand.toggle(id)}
              header={
                <>
                  <span className="font-semibold">{row.symbol}</span>
                  <span className="shrink-0 text-xs text-[var(--mt5-muted)]">
                    {fmtMt5Date(row.closedAt)}
                  </span>
                </>
              }
              subheader={
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <Mt5DirectionTag
                      direction={row.direction}
                      volume={0.01}
                      suffix={
                        orderTypeLabel(row).includes("limit") ? "limit" : undefined
                      }
                    />
                    {" · "}
                    0.01 / 0.01 at{" "}
                    {row.entryPrice != null
                      ? fmtMt5Price(row.entryPrice)
                      : fmtMt5Price(row.entryMin)}
                  </span>
                  <span
                    className="shrink-0 text-xs font-semibold uppercase"
                    style={{
                      color: status === "FILLED" ? "#4a9eff" : "var(--mt5-muted)",
                    }}
                  >
                    {status}
                  </span>
                </div>
              }
              actions={
                <Mt5ActionStrip
                  actions={[
                    {
                      key: "setup",
                      label: "Setup",
                      variant: "buy",
                      loading: loadingSignalId === row.signalId,
                      onClick: () => onOpenSetup(row),
                    },
                  ]}
                />
              }
            >
              <Mt5DetailGrid
                left={[
                  { label: "S / L:", value: fmtMt5Price(row.stopLoss) },
                  { label: "T / P:", value: fmtMt5Price(row.takeProfit) },
                ]}
                right={[
                  {
                    label: "Zone:",
                    value: `${fmtMt5Price(row.entryMin)} – ${fmtMt5Price(row.entryMax)}`,
                  },
                  { label: "Setup:", value: `#${row.signalId.slice(0, 8)}` },
                ]}
              />
            </Mt5ExpandableRow>
          );
        })}
      </div>
    );
  }

  /* DEALS */
  if (deals.length === 0) {
    return <Mt5Empty title="No deals yet" />;
  }

  const totalProfit = deals.reduce((s, d) => s + (d.pnl ?? 0), 0);

  return (
    <div>
      <Mt5SummaryBlock
        rows={[
          {
            label: "Profit",
            value: fmtMt5Price(totalProfit),
            color: totalProfit >= 0 ? "#4a9eff" : "#ff5252",
          },
          { label: "Deals", value: String(deals.length) },
        ]}
      />
      {deals.map((row) => {
        const id = `deal-${row.id}`;
        const expanded = expand.isExpanded(id);
        const pnl = row.pnl ?? 0;
        return (
          <Mt5ExpandableRow
            key={id}
            id={id}
            expanded={expanded}
            onToggle={() => expand.toggle(id)}
            header={
              <>
                <div>
                  <span className="font-semibold">{row.symbol}</span>
                  <span className="ml-2">
                    <Mt5DirectionTag direction={row.direction} volume={0.01} />
                  </span>
                </div>
                <span className="shrink-0 text-xs text-[var(--mt5-muted)]">
                  {fmtMt5Date(row.closedAt)}
                </span>
              </>
            }
            subheader={
              <div className="flex items-center justify-between">
                <span>
                  {row.entryPrice != null
                    ? `${fmtMt5Price(row.entryPrice)} → ${fmtMt5Price(row.exitPrice)}`
                    : `Entry ${fmtMt5Price(row.entryMin)} – ${fmtMt5Price(row.entryMax)}`}
                </span>
                {row.pnl != null && <Mt5Pnl value={pnl} />}
              </div>
            }
            actions={
              <Mt5ActionStrip
                actions={[
                  {
                    key: "setup",
                    label: "Setup",
                    variant: "buy",
                    loading: loadingSignalId === row.signalId,
                    onClick: () => onOpenSetup(row),
                  },
                ]}
              />
            }
          >
            <Mt5DetailGrid
              left={[
                { label: "", value: `#${row.signalId.slice(0, 10)}` },
                { label: "S / L:", value: fmtMt5Price(row.stopLoss) },
                { label: "T / P:", value: fmtMt5Price(row.takeProfit) },
              ]}
              right={[
                { label: "Open:", value: fmtMt5Date(row.submittedAt) },
                { label: "Swap:", value: "0.00" },
                { label: "Commission:", value: "0.00" },
              ]}
            />
          </Mt5ExpandableRow>
        );
      })}
    </div>
  );
}
