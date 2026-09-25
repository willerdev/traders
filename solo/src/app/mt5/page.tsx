"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CandlestickChart,
  History,
  Home,
  LineChart,
  Loader2,
  Pause,
  Play,
  Plus,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import { api, type UserMt5HistoryItem, type UserMt5Trade } from "@/lib/api";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { useAuthStore } from "@/stores/auth";
import { canManageSoloTrades } from "@/lib/solo-admin";
import { useMt5Terminal } from "@/hooks/use-mt5-terminal";
import { Mt5ChartTerminal } from "@/components/mt5/mt5-chart-terminal";
import { TradingConnectDialog } from "@/components/mt5/trading-connect-dialog";
import { TradingPlaceTradeCard } from "@/components/mt5/trading-place-trade-card";
import { TradingAlertsPanel } from "@/components/mt5/trading-alerts-panel";
import { TradingHistoryPanel } from "@/components/mt5/trading-history-panel";
import { useMt5History } from "@/hooks/use-mt5-history";
import { TradingLiveBalance } from "@/components/mt5/trading-live-balance";
import { Mt5PlaceOrderModal } from "@/components/mt5/mt5-place-order-modal";
import { Mt5PositionModifyModal } from "@/components/mt5/mt5-position-modify-modal";
import { Mt5MobileTradeBoard } from "@/components/mt5/mt5-mobile-trade-board";
import { Mt5MobileHistoryBoard } from "@/components/mt5/mt5-mobile-history-board";
import type { Mt5PlaceKind } from "@/lib/mt5-place-kind";
import { pickDefaultChartSymbol } from "@/lib/chart-market-status";
import { useChartWatchlist } from "@/components/charts/use-chart-watchlist";
import { usePriceAlertMonitor } from "@/hooks/use-price-alert-monitor";
import { useMetaApiLive } from "@/hooks/use-metaapi-live";
import { setMetaApiHasOpenTrades } from "@/lib/metaapi-live";
import { cn } from "@/lib/utils";
import { useDismissFlag, useForceMobileLayout } from "@/hooks/use-dismiss-flag";

type RightTab = "watchlist" | "alerts" | "history";
type MobileTab = "trade" | "history" | "chart";

export default function SoloMt5Page() {
  const { ready, hasHydrated } = useRequireAuth();
  const userId = useAuthStore((s) => s.user?.id);
  const user = useAuthStore((s) => s.user);
  const canTrade = canManageSoloTrades(user);
  const [dailyLossLocked, setDailyLossLocked] = useState(
    Boolean(user?.soloDailyLossLocked),
  );
  const canPlace = canTrade && !dailyLossLocked;

  useEffect(() => {
    if (!ready) return;
    void api.users
      .dashboard()
      .then((data) => {
        const auth = useAuthStore.getState();
        if (!auth.user || !auth.token || !data?.user) return;
        useAuthStore.getState().setAuth(auth.token, {
          ...auth.user,
          role: data.user.role ?? auth.user.role,
          canManageTrades:
            data.user.canManageTrades ?? auth.user.canManageTrades,
          soloTradeOperator:
            data.user.soloTradeOperator ?? auth.user.soloTradeOperator,
          isSoloPlatformAdmin:
            data.user.isSoloPlatformAdmin ?? auth.user.isSoloPlatformAdmin,
          soloDailyLossLocked:
            data.user.soloDailyLossLocked ?? auth.user.soloDailyLossLocked,
        });
      })
      .catch(() => undefined);
    void api.soloTraders
      .me()
      .then((me) => {
        setDailyLossLocked(Boolean(me.dailyLossLocked));
      })
      .catch(() => undefined);
  }, [ready]);
  const [selectedChartSymbol, setSelectedChartSymbol] = useState<string | null>(
    null,
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("alerts");
  const [mobileTab, setMobileTab] = useState<MobileTab>("trade");
  const { hideChart } = useForceMobileLayout();
  const hidePlace = useDismissFlag("mt5-hide-place");
  const hideBalance = useDismissFlag("mt5-hide-balance");
  const hideConnect = useDismissFlag("mt5-hide-connect");
  const hideError = useDismissFlag("mt5-hide-error");
  const [orderModal, setOrderModal] = useState<Mt5PlaceKind | null>(null);
  const [modifyTrade, setModifyTrade] = useState<UserMt5Trade | null>(null);
  const [lotSize, setLotSize] = useState("0.01");
  const [reviewedHistory, setReviewedHistory] =
    useState<UserMt5HistoryItem | null>(null);
  const { watchlist, addSymbol } = useChartWatchlist();
  const { live, setPaused, seeLiveData } = useMetaApiLive();

  useEffect(() => {
    seeLiveData();
  }, [seeLiveData]);

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

  const tradeKey = (t: UserMt5Trade) =>
    t.positionId ?? t.orderId ?? `${t.symbol}-${t.openPrice ?? ""}`;
  const limitTrades = useMemo(() => {
    const merged = new Map<string, UserMt5Trade>();
    for (const trade of data?.trades ?? []) {
      if (trade.kind === "limit") merged.set(tradeKey(trade), trade);
    }
    for (const trade of runningTrades) {
      if (trade.kind === "limit") merged.set(tradeKey(trade), trade);
    }
    return [...merged.values()];
  }, [data?.trades, runningTrades]);
  const displayRunningTrades = useMemo(() => {
    const merged = new Map<string, UserMt5Trade>();
    for (const trade of data?.trades ?? []) {
      if (trade.kind !== "running") continue;
      merged.set(tradeKey(trade), trade);
    }
    for (const trade of runningTrades) {
      if (trade.kind === "limit") continue;
      merged.set(tradeKey(trade), trade);
    }
    return [...merged.values()];
  }, [data?.trades, runningTrades]);
  const openTrades = useMemo(
    () => [...displayRunningTrades, ...limitTrades],
    [displayRunningTrades, limitTrades],
  );

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

  useEffect(() => {
    setMetaApiHasOpenTrades(hasOpenTrades);
  }, [hasOpenTrades]);

  const account = data?.account;
  const equity = account?.equity ?? account?.startingBalance ?? 0;
  const walletBalance = account?.startingBalance ?? 0;
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
    const live = lastPrices[chartSymbol.toUpperCase()];
    if (live != null) return live;
    const q = quotes.find(
      (item) => item.symbol.toUpperCase() === chartSymbol.toUpperCase(),
    );
    return q?.mid ?? q?.bid ?? null;
  }, [quotes, chartSymbol, lastPrices]);

  const handleCloseTrade = useCallback(
    async (trade: UserMt5Trade) => {
      const id = trade.positionId ?? trade.orderId;
      if (!id) return;
      setError(null);
      try {
        await api.signals.closeMt5Position(id);
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

  function afterLinked() {
    void load({ background: false });
    void loadRunning();
    void loadHistory({ fresh: true });
  }

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div className="mt5-mobile-desk mt5-shell">
        <div className="flex shrink-0 items-center justify-end border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-1.5">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-foreground"
          >
            <Home className="h-5 w-5" />
            Home
          </Link>
        </div>
        {error && !hideError.hidden ? (
          <p className="flex shrink-0 items-start justify-between gap-2 px-3 py-1.5 text-sm text-danger">
            <span>{error}</span>
            <button
              type="button"
              onClick={hideError.dismiss}
              className="rounded-full p-0.5 text-danger/80"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </p>
        ) : null}
        {dailyLossLocked ? (
          <p className="shrink-0 px-3 py-1.5 text-center text-[11px] text-amber-300">
            Daily loss limit of $200 reached. You can close or modify open trades. An admin must reset to open new ones.
          </p>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--mt5-bg)]">
          {mobileTab === "trade" ? (
            loading && !data ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-muted" />
              </div>
            ) : (
              <Mt5MobileTradeBoard
                trades={openTrades}
                account={data?.account}
                canTrade={canTrade}
                onModify={setModifyTrade}
                onClose={(trade) => void handleCloseTrade(trade)}
                onChart={(symbol) => {
                  setSelectedChartSymbol(symbol);
                  setMobileTab("chart");
                }}
                onTrade={(symbol) => {
                  setSelectedChartSymbol(symbol);
                  setMobileTab("chart");
                  hidePlace.restore();
                }}
                onNewOrder={() => {
                  setMobileTab("chart");
                  hidePlace.restore();
                }}
                onBulk={() => {
                  void api.signals.closeAllMt5Positions().then(() => {
                    void load({ background: true });
                    void loadRunning();
                  });
                }}
              />
            )
          ) : mobileTab === "history" ? (
            <Mt5MobileHistoryBoard
              items={historyItems}
              loading={historyLoading}
              error={historyError}
              onChart={(item) => {
                setReviewedHistory(item);
                setSelectedChartSymbol(item.symbol);
                setMobileTab("chart");
              }}
              onTrade={(item) => {
                setReviewedHistory(item);
                setSelectedChartSymbol(item.symbol);
                setMobileTab("chart");
                hidePlace.restore();
              }}
            />
          ) : (
            <div className="relative min-h-0 flex-1">
              <Mt5ChartTerminal
                quotes={quotes}
                runningTrades={displayRunningTrades}
                limitTrades={limitTrades}
                setups={[]}
                account={data?.account}
                accountSource={data?.accountSource}
                selectedSymbol={chartSymbol}
                reviewedHistory={reviewedHistory}
                onSelectSymbol={(sym) => {
                  setReviewedHistory(null);
                  setSelectedChartSymbol(sym);
                  addSymbol(sym);
                }}
                onOpenSetup={() => undefined}
                showOrdersPanel={false}
                showTradeBar={false}
                chartOnly
                onDismiss={() => setMobileTab("trade")}
              />
            </div>
          )}
          {mobileTab === "chart" ? (
            hidePlace.hidden ? (
            <button
              type="button"
              onClick={hidePlace.restore}
              className="shrink-0 border-t border-[var(--mt5-divider)] py-2 text-center text-[11px] font-semibold text-muted"
            >
              Show orders
            </button>
          ) : (
          <div className="shrink-0 border-t border-[var(--mt5-divider)]">
            <TradingPlaceTradeCard
              linked={linked}
              canTrade={canPlace}
              dense
              onDismiss={hidePlace.dismiss}
              lotSize={lotSize}
              onLotSizeChange={setLotSize}
              onAdjustLot={(delta) => {
                setLotSize((prev) => {
                  const next = Math.max(0.01, Number(prev) + delta);
                  if (!Number.isFinite(next)) return "0.01";
                  return next.toFixed(2);
                });
              }}
              onPlace={(kind) => setOrderModal(kind)}
              onNeedConnect={() => setConnectOpen(true)}
            />
          </div>
          )
          ) : null}
          <nav
            className="grid shrink-0 grid-cols-3 border-t border-[var(--mt5-divider)] bg-[var(--mt5-surface)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            aria-label="Trading sections"
          >
            {(
              [
                ["chart", "Chart", LineChart],
                ["trade", "Trade", CandlestickChart],
                ["history", "History", History],
              ] as const
            ).map(([id, label, Icon]) => {
              const active = mobileTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMobileTab(id)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-3 text-[13px] font-semibold",
                    active ? "text-foreground" : "text-muted",
                  )}
                >
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
                  <span>
                    {label}
                    {id === "trade" && openTrades.length > 0 ? (
                      <span className="ml-1 tabular-nums text-[11px] text-muted">
                        {openTrades.length}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mt5-desktop-desk">
        <header className="flex shrink-0 flex-wrap items-center gap-3 px-5 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-2xl">
            Trading
          </h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={hideChart}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted lg:hidden"
            >
              <X className="h-3.5 w-3.5" />
              Hide chart
            </button>
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
        {error ? (
          <p className="px-5 pb-2 text-sm text-danger">{error}</p>
        ) : null}
        {dailyLossLocked ? (
          <p className="px-5 pb-2 text-sm text-amber-300">
            Daily loss limit of $200 reached. You can close or modify open trades. An admin must reset to open new ones.
          </p>
        ) : null}
        {hideBalance.hidden ? (
          <button
            type="button"
            onClick={hideBalance.restore}
            className="mx-5 mb-2 text-left text-xs font-semibold text-muted"
          >
            Show balance
          </button>
        ) : (
        <TradingLiveBalance
          equity={equity}
          balance={walletBalance}
          currency={account?.currency ?? "USD"}
          live={live}
          linked={linked}
          floating={account?.floatingProfit ?? 0}
          dayPnl={dayPnl}
          onDismiss={hideBalance.dismiss}
        />
        )}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:gap-3 md:px-5 md:pb-4 md:pt-3">
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
                  setups={[]}
                  account={data?.account}
                  accountSource={data?.accountSource}
                  selectedSymbol={chartSymbol}
                  reviewedHistory={reviewedHistory}
                  onSelectSymbol={(sym) => {
                    setReviewedHistory(null);
                    setSelectedChartSymbol(sym);
                    addSymbol(sym);
                  }}
                  onOpenSetup={() => undefined}
                  onCloseTrade={
                    canTrade
                      ? (trade) => void handleCloseTrade(trade)
                      : undefined
                  }
                  canManageTrades={canTrade}
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
                  onDismiss={hideChart}
                />
              </div>
            )}

            {needsConnect && !hideConnect.hidden && (
              <div className="relative border-t border-border px-4 py-8 text-center sm:px-8">
                <button
                  type="button"
                  onClick={hideConnect.dismiss}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-muted hover:text-foreground"
                  aria-label="Hide connect card"
                >
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-lg font-semibold text-foreground">
                  {canTrade
                    ? "Connect your trading account before you trade"
                    : "Waiting for the admin to connect MetaAPI"}
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
                  {canTrade
                    ? "To use the trading workspace, you will need to connect the MetaAPI account first. Once connected, both of you see the same live positions."
                    : "You will then see the same live chart, balance, and open positions. Only the platform admin and assigned traders can place, close, or modify trades."}
                </p>
                {canTrade ? (
                <button
                  type="button"
                  onClick={() => setConnectOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Connect Trading Account
                </button>
                ) : null}
                {canTrade ? (
                <p className="mt-3 text-xs text-muted">
                  Need help connecting?
                </p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <aside className="flex min-h-0 w-full shrink-0 flex-col gap-3 overflow-hidden md:h-full md:w-[22rem]">
          <TradingPlaceTradeCard
            linked={linked}
            canTrade={canPlace}
            lotSize={lotSize}
            onLotSizeChange={setLotSize}
            onAdjustLot={(delta) => {
              setLotSize((prev) => {
                const next = Math.max(0.01, Number(prev) + delta);
                if (!Number.isFinite(next)) return "0.01";
                return next.toFixed(2);
              });
            }}
            onPlace={(kind) => setOrderModal(kind)}
            onNeedConnect={() => setConnectOpen(true)}
          />
          <div className="flex max-h-[min(28rem,50dvh)] min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface md:max-h-none">
            <div className="flex border-b border-border text-xs font-medium">
              {(
                [
                  ["watchlist", "Watchlist", Star],
                  ["alerts", "Alerts", Bell],
                  ["history", "History", History],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRightTab(id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5",
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
            </div>
          </div>
        </aside>
        </div>
      </div>

      {orderModal && (
        <Mt5PlaceOrderModal
          symbol={chartSymbol}
          kind={orderModal}
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

      {modifyTrade && (
        <Mt5PositionModifyModal
          trade={modifyTrade}
          open
          canManage={canTrade}
          onClose={() => setModifyTrade(null)}
          onChanged={() => {
            setModifyTrade(null);
            void load({ background: true });
            void loadRunning();
            void loadHistory({ fresh: true });
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
