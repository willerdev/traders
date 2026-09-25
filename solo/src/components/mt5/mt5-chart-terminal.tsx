"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  OpenSetupItem,
  UserMt5AccountSummary,
  UserMt5AccountSource,
  UserMt5HistoryItem,
  UserMt5QuoteItem,
  UserMt5Trade,
} from "@/lib/api";
import type { SetupSummary } from "@/components/dashboard/setup-detail-modal";
import {
  LightweightChart,
  type ChartLoadReason,
  type LightweightChartHandle,
} from "@/components/charts/lightweight-chart";
import { ChartSymbolPicker } from "@/components/charts/chart-symbol-picker";
import {
  CHART_TIMEFRAMES,
  type ChartTimeframe,
} from "@/components/charts/chart-types";
import { useChartWatchlist } from "@/components/charts/use-chart-watchlist";
import { buildMt5ChartOverlays, historyEntryUnix } from "@/components/mt5/build-mt5-chart-overlays";
import { persistStopChange } from "@/components/charts/persist-stop-change";
import type { ChartPriceLine } from "@/components/charts/chart-types";
import { ChartUserWatermark } from "@/components/mt5/chart-user-watermark";
import { Mt5ChartSettingsButton } from "@/components/mt5/mt5-chart-settings-button";
import { Mt5ChartSymbolOverlay } from "@/components/mt5/mt5-chart-symbol-overlay";
import {
  Mt5ChartRadialMenu,
  clampRadialAnchor,
  type RadialToolId,
} from "@/components/mt5/mt5-chart-radial-menu";
import { useMt5ChartDisplaySettings } from "@/hooks/use-mt5-chart-display-settings";
import { useAuthStore } from "@/stores/auth";
import {
  MT5_BUY,
  MT5_SELL,
  Mt5Pnl,
  fmtMt5Price,
} from "@/components/mt5/mt5-ui";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { prefetchChartBarCache } from "@/lib/chart-bar-cache";
import { loadChartData, isPlausibleQuotePrice } from "@/components/charts/chart-data.service";
import { Mt5PlaceOrderModal } from "@/components/mt5/mt5-place-order-modal";
import type { Mt5PlaceKind } from "@/lib/mt5-place-kind";
import { Mt5PositionModifyModal } from "@/components/mt5/mt5-position-modify-modal";
import {
  ChartAlertToastStack,
  ChartToolsToolbar,
} from "@/components/charts/chart-tools-toolbar";
import { useChartTools } from "@/hooks/use-chart-tools";
import { useChartLiveQuotes } from "@/hooks/use-chart-live-quotes";

const TF_DESK_LABEL: Record<ChartTimeframe, string> = {
  M1: "1m",
  M5: "5m",
  M15: "15m",
  H1: "1h",
  D1: "1D",
};

const ACCOUNT_PANEL_FRAC = 0.3;
const ACCOUNT_PANEL_MIN = 0.16;
const ACCOUNT_PANEL_MAX = 0.62;

type Props = {
  quotes: UserMt5QuoteItem[];
  runningTrades: UserMt5Trade[];
  limitTrades: UserMt5Trade[];
  setups: OpenSetupItem[];
  account?: UserMt5AccountSummary;
  accountSource?: UserMt5AccountSource;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenSetup: (setup: SetupSummary) => void;
  onCloseTrade?: (trade: UserMt5Trade) => void;
  showOrdersPanel?: boolean;
  /** Mobile Charts tab — chart fills viewport, no orders panel height cap */
  chartOnly?: boolean;
  onStopsUpdated?: () => void;
  onTradePlaced?: () => void;
  forceChartTheme?: "dark" | "light";
  showTradeBar?: boolean;
  workspaceLayout?: boolean;
  canManageTrades?: boolean;
  reviewedHistory?: UserMt5HistoryItem | null;
  onDismiss?: () => void;
};

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

type OrderRow = {
  key: string;
  symbol: string;
  trade: UserMt5Trade;
  kind: "running" | "limit";
};

export function Mt5ChartTerminal({
  quotes,
  runningTrades,
  limitTrades,
  setups,
  account,
  accountSource,
  selectedSymbol,
  onSelectSymbol,
  onOpenSetup,
  onCloseTrade,
  showOrdersPanel = true,
  chartOnly = false,
  onStopsUpdated,
  onTradePlaced,
  forceChartTheme,
  showTradeBar = false,
  workspaceLayout = false,
  canManageTrades = false,
  reviewedHistory = null,
  onDismiss,
}: Props) {
  const chartRef = useRef<LightweightChartHandle>(null);
  const [orderModal, setOrderModal] = useState<Mt5PlaceKind | null>(null);
  const [lotSize, setLotSize] = useState("0.01");
  const [focusedTrade, setFocusedTrade] = useState<UserMt5Trade | null>(null);
  const [modifyOpen, setModifyOpen] = useState(false);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const [panelFrac, setPanelFrac] = useState(ACCOUNT_PANEL_FRAC);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const symbolSearchRef = useRef<HTMLInputElement>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("M5");
  const [radialOpen, setRadialOpen] = useState(false);
  const [radialAnchor, setRadialAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [chartBounds, setChartBounds] = useState({ width: 320, height: 400 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartLoadReason, setChartLoadReason] = useState<ChartLoadReason | null>(
    null,
  );
  const handleChartLoadingChange = useCallback(
    (loading: boolean, reason?: ChartLoadReason) => {
      setChartLoading(loading);
      setChartLoadReason(loading ? (reason ?? null) : null);
    },
    [],
  );
  const [chartStatus, setChartStatus] = useState<{
    source?: "metaapi" | "quote-fallback";
    error?: string | null;
  }>({});
  const { watchlist, addSymbol, removeSymbol } = useChartWatchlist();
  const { settings: chartSettings, setSetting: setChartSetting } =
    useMt5ChartDisplaySettings();
  const chartTools = useChartTools(selectedSymbol);
  const {
    checkPriceAlerts,
    alertToasts,
    dismissToast,
    activeTool,
    setActiveTool,
    alerts,
    pendingTrend,
    removeAlert,
    clearTriggeredAlerts,
    handleChartPoint,
    drawings,
    removeDrawing,
    cancelTool,
  } = chartTools;
  const userDisplayName = useAuthStore((s) => s.user?.displayName ?? "");
  const { liveQuote, getActiveQuote, watchlistQuotes } = useChartLiveQuotes(
    selectedSymbol,
    watchlist,
  );

  useEffect(() => {
    if (!isResizingSplit) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "ns-resize";
    return () => {
      document.body.style.cursor = prev;
    };
  }, [isResizingSplit]);

  useEffect(() => {
    if (workspaceLayout) return;
    if (liveQuote?.mid != null) {
      checkPriceAlerts(selectedSymbol, liveQuote.mid);
    }
    for (const [sym, quote] of Object.entries(watchlistQuotes)) {
      if (quote.mid != null) checkPriceAlerts(sym, quote.mid);
    }
  }, [
    workspaceLayout,
    liveQuote?.mid,
    watchlistQuotes,
    selectedSymbol,
    checkPriceAlerts,
  ]);

  useEffect(() => {
    if (workspaceLayout) return;
    const others = watchlist.filter((sym) => sym !== selectedSymbol);
    for (const sym of others) {
      prefetchChartBarCache(sym, timeframe, () => loadChartData(sym, timeframe));
    }
  }, [watchlist, selectedSymbol, timeframe, workspaceLayout]);

  const openOrders = useMemo((): OrderRow[] => {
    const rows: OrderRow[] = [];
    for (const t of runningTrades) {
      rows.push({
        key: `run-${t.positionId ?? t.orderId ?? t.symbol}`,
        symbol: t.symbol,
        trade: t,
        kind: "running",
      });
    }
    for (const t of limitTrades) {
      rows.push({
        key: `lim-${t.orderId ?? t.symbol}`,
        symbol: t.symbol,
        trade: t,
        kind: "limit",
      });
    }
    return rows;
  }, [runningTrades, limitTrades]);

  useEffect(() => {
    if (!focusedTrade) return;
    const id = focusedTrade.positionId ?? focusedTrade.orderId;
    if (!id) return;
    const next = [...runningTrades, ...limitTrades].find(
      (t) => (t.positionId ?? t.orderId) === id,
    );
    if (!next) {
      setFocusedTrade(null);
      setModifyOpen(false);
      return;
    }
    if (next !== focusedTrade) setFocusedTrade(next);
  }, [runningTrades, limitTrades, focusedTrade]);

  const symbolOrders = useMemo(
    () => openOrders.filter((o) => o.symbol === selectedSymbol),
    [openOrders, selectedSymbol],
  );

  const symbolFloating = useMemo(
    () => symbolOrders.reduce((sum, o) => sum + (o.trade.profit ?? 0), 0),
    [symbolOrders],
  );

  const symbolVolume = useMemo(
    () => symbolOrders.reduce((sum, o) => sum + (o.trade.volume ?? 0), 0),
    [symbolOrders],
  );

  const handlePriceLineDragEnd = useCallback(
    async (line: ChartPriceLine, newPrice: number) => {
      await persistStopChange(line, newPrice);
      onStopsUpdated?.();
    },
    [onStopsUpdated],
  );

  const totalProfit = useMemo(
    () => openOrders.reduce((sum, o) => sum + (o.trade.profit ?? 0), 0),
    [openOrders],
  );

  const { priceLines, markers, summary: overlaySummary } = useMemo(
    () =>
      buildMt5ChartOverlays({
        selectedSymbol,
        timeframe,
        runningTrades,
        limitTrades,
        setups,
        reviewedHistory,
        options: {
          showOrders: chartSettings.showOrders,
          showLimits: chartSettings.showLimits,
          showSlTp: chartSettings.showSlTp,
          focusPositionId:
            focusedTrade?.positionId ?? focusedTrade?.orderId ?? null,
        },
      }),
    [
      selectedSymbol,
      timeframe,
      runningTrades,
      limitTrades,
      setups,
      reviewedHistory,
      chartSettings.showOrders,
      chartSettings.showLimits,
      chartSettings.showSlTp,
      focusedTrade?.positionId,
      focusedTrade?.orderId,
    ],
  );

  const chartPriceLines = useMemo(() => {
    const extra: typeof priceLines = [];
    const quoteMid = getActiveQuote(selectedSymbol)?.mid ?? liveQuote?.mid ?? null;

    if (chartSettings.showDrawings) {
      for (const d of drawings) {
        if (d.type === "hline" && isPlausibleQuotePrice(selectedSymbol, d.price, quoteMid)) {
          extra.push({
            id: d.id,
            price: d.price,
            color: "#a78bfa",
            title: fmtMt5Price(d.price),
            lineStyle: 1,
          });
        }
      }
      for (const a of alerts.filter((item) => !item.triggered)) {
        if (!isPlausibleQuotePrice(selectedSymbol, a.price, quoteMid)) continue;
        extra.push({
          id: a.id,
          price: a.price,
          color: "#fbbf24",
          title: `Alert ${fmtMt5Price(a.price)}`,
          lineStyle: 0,
        });
      }
    }
    if (quoteMid != null && Number.isFinite(quoteMid)) {
      extra.push({
        id: "__live_mid__",
        price: quoteMid,
        color: MT5_BUY,
        title: `Live ${fmtMt5Price(quoteMid)}`,
        lineStyle: 2,
      });
    }
    return [...priceLines, ...extra];
  }, [
    priceLines,
    drawings,
    alerts,
    chartSettings.showDrawings,
    liveQuote?.mid,
    getActiveQuote,
    selectedSymbol,
  ]);

  const eraseTargets = useMemo(
    () =>
      alerts
        .filter((a) => !a.triggered)
        .map((a) => ({ id: a.id, price: a.price })),
    [alerts],
  );

  function handleTimeframeChange(tf: ChartTimeframe) {
    setTimeframe(tf);
  }

  function handleSymbolChange(symbol: string) {
    onSelectSymbol(symbol);
    if (focusedTrade && focusedTrade.symbol !== symbol) {
      setFocusedTrade(null);
      setModifyOpen(false);
    }
  }

  function openPosition(trade: UserMt5Trade) {
    onSelectSymbol(trade.symbol);
    setFocusedTrade(trade);
    setModifyOpen(true);
  }

  function handleAddSymbol(symbol: string) {
    addSymbol(symbol);
    onSelectSymbol(symbol);
  }

  function handleChartTap(point: { clientX: number; clientY: number }) {
    const area = chartAreaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    setChartBounds({ width: rect.width, height: rect.height });
    const anchor = clampRadialAnchor(
      point.clientX - rect.left,
      point.clientY - rect.top,
      { width: rect.width, height: rect.height },
    );
    setRadialAnchor(anchor);
    setRadialOpen(true);
  }

  function handleRadialTool(tool: RadialToolId) {
    switch (tool) {
      case "settings":
        setSettingsOpen(true);
        setRadialOpen(false);
        break;
      case "layout":
        chartRef.current?.fitContent();
        setRadialOpen(false);
        break;
    }
  }

  function focusSymbolSearch() {
    symbolSearchRef.current?.focus();
    symbolSearchRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const desktopTerminal = showOrdersPanel && !chartOnly;

  const applyPanelFracFromPointer = useCallback((clientY: number) => {
    const box = splitRef.current?.getBoundingClientRect();
    if (!box || box.height < 80) return;
    const next = (box.bottom - clientY) / box.height;
    setPanelFrac(
      Math.min(ACCOUNT_PANEL_MAX, Math.max(ACCOUNT_PANEL_MIN, next)),
    );
  }, []);

  const onSplitPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsResizingSplit(true);
      applyPanelFracFromPointer(e.clientY);
    },
    [applyPanelFracFromPointer],
  );

  const onSplitPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      applyPanelFracFromPointer(e.clientY);
    },
    [applyPanelFracFromPointer],
  );

  const onSplitPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setIsResizingSplit(false);
    },
    [],
  );

  function adjustLotSize(delta: number) {
    setLotSize((prev) => {
      const next = Math.max(0.01, Number(prev) + delta);
      if (!Number.isFinite(next)) return "0.01";
      return next.toFixed(2);
    });
  }

  const parsedLotSize = Number(lotSize);
  const orderVolume =
    Number.isFinite(parsedLotSize) && parsedLotSize >= 0.01
      ? parsedLotSize
      : undefined;

  const orderActionBar = canManageTrades ? (
    <div className="flex shrink-0 items-center justify-center gap-2 border-t border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-2">
      <button
        type="button"
        onClick={() => setOrderModal("BUY")}
        className="min-w-[4.75rem] rounded-md px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-opacity hover:opacity-90"
        style={{ backgroundColor: MT5_BUY }}
      >
        Buy
      </button>

      <div className="flex items-center gap-1 rounded-md border border-[var(--mt5-divider)] bg-[var(--mt5-bg)] px-1.5 py-1">
        <button
          type="button"
          onClick={() => adjustLotSize(-0.01)}
          className="flex h-6 w-6 items-center justify-center rounded text-sm font-semibold text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)] hover:text-white"
          aria-label="Decrease lot size"
        >
          −
        </button>
        <input
          type="number"
          min={0.01}
          step={0.01}
          value={lotSize}
          onChange={(e) => setLotSize(e.target.value)}
          className="w-14 bg-transparent text-center text-xs font-semibold tabular-nums text-white outline-none"
          aria-label="Lot size"
        />
        <button
          type="button"
          onClick={() => adjustLotSize(0.01)}
          className="flex h-6 w-6 items-center justify-center rounded text-sm font-semibold text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)] hover:text-white"
          aria-label="Increase lot size"
        >
          +
        </button>
        <span className="pl-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--mt5-muted)]">
          lot
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOrderModal("SELL")}
        className="min-w-[4.75rem] rounded-md px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-opacity hover:opacity-90"
        style={{ backgroundColor: MT5_SELL }}
      >
        Sell
      </button>
    </div>
  ) : null;

  return (
    <div
      className={cn(
        "mt5-shell relative flex min-h-0 flex-col bg-[var(--mt5-bg)]",
        chartOnly
          ? "h-full min-h-0 flex-1 overflow-hidden pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0"
          : "h-full min-h-0 flex-1 overflow-hidden",
      )}
      data-mt5-chart-terminal
    >
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-2 top-2 z-[30] flex items-center gap-1 rounded-full bg-[var(--mt5-surface)]/95 px-2.5 py-1 text-[11px] font-semibold text-[var(--mt5-text)] shadow-md lg:hidden"
          aria-label="Hide chart"
        >
          <X className="h-3.5 w-3.5" />
          Hide chart
        </button>
      ) : null}

      {!workspaceLayout && (
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-2 py-1.5 lg:px-3">
        <ChartSymbolPicker
          compact
          selectedSymbol={selectedSymbol}
          watchlist={watchlist}
          onSelect={handleSymbolChange}
          onAdd={handleAddSymbol}
          onRemove={removeSymbol}
          searchInputRef={symbolSearchRef}
          className="min-w-0 flex-1"
        />

        {!chartOnly && (
          <div className="hidden shrink-0 gap-0.5 md:flex">
            {CHART_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => handleTimeframeChange(tf)}
                className={cn(
                  "min-w-[2.25rem] rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  timeframe === tf
                    ? "bg-primary text-white"
                    : "text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)]",
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        )}

        <ChartToolsToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onDone={cancelTool}
          alerts={alerts}
          pendingTrend={pendingTrend != null}
          onRemoveAlert={removeAlert}
          onClearTriggered={clearTriggeredAlerts}
          className="hidden shrink-0 md:flex"
        />

        <Mt5ChartSettingsButton
          placement="toolbar"
          settings={chartSettings}
          onChange={setChartSetting}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />

        {chartLoading && chartLoadReason !== "timeframe" && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--mt5-muted)]" />
        )}
      </div>
      )}

      <div
        ref={splitRef}
        className={cn(
          "grid min-h-0 flex-1",
          isResizingSplit && "select-none",
        )}
        style={{
          gridTemplateRows: desktopTerminal
            ? `minmax(0, ${(1 - panelFrac).toFixed(3)}fr) 8px minmax(0, ${panelFrac.toFixed(3)}fr)`
            : "minmax(0, 1fr)",
        }}
      >
      <div
        className={cn(
          "flex min-h-0 min-w-0 overflow-hidden",
          workspaceLayout ? "flex-row" : "flex-col",
        )}
      >
        {workspaceLayout && (
          <div className="flex w-11 shrink-0 flex-col items-center border-r border-[var(--mt5-divider)] bg-[var(--mt5-surface)] py-2">
            <ChartToolsToolbar
              orientation="vertical"
              activeTool={activeTool}
              onToolChange={setActiveTool}
              onDone={cancelTool}
              alerts={alerts}
              pendingTrend={pendingTrend != null}
              onRemoveAlert={removeAlert}
              onClearTriggered={clearTriggeredAlerts}
            />
          </div>
        )}
        <div
          className={
            workspaceLayout
              ? "flex h-full min-h-0 min-w-0 flex-1 flex-col"
              : "contents"
          }
        >
          {workspaceLayout && (
            <div className="flex shrink-0 items-center gap-1 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-2 py-1.5">
              {CHART_TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => handleTimeframeChange(tf)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium",
                    timeframe === tf
                      ? "bg-primary text-white"
                      : "text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)]",
                  )}
                >
                  {TF_DESK_LABEL[tf]}
                </button>
              ))}
              <ChartSymbolPicker
                compact
                selectedSymbol={selectedSymbol}
                watchlist={watchlist}
                onSelect={handleSymbolChange}
                onAdd={handleAddSymbol}
                onRemove={removeSymbol}
                searchInputRef={symbolSearchRef}
                className="ml-2 min-w-0 max-w-[14rem]"
                hideChips
              />
              <span className="ml-auto hidden text-xs text-[var(--mt5-muted)] sm:inline">
                Indicators
              </span>
            </div>
          )}

        {overlaySummary.total > 0 && !workspaceLayout && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-2 py-1 text-[9px] font-medium text-[var(--mt5-muted)]">
            {overlaySummary.running > 0 && (
              <span className="rounded bg-[#4a9eff]/15 px-1.5 py-0.5 text-[#4a9eff]">
                {overlaySummary.running} open
              </span>
            )}
            {overlaySummary.limits > 0 && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
                {overlaySummary.limits} limit
              </span>
            )}
            {overlaySummary.setups > 0 && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                {overlaySummary.setups} setup
              </span>
            )}
            {symbolOrders.length > 0 && (
              <span className="rounded bg-[var(--mt5-row-hover)] px-1.5 py-0.5 text-[var(--mt5-text)]">
                <Mt5Pnl value={symbolFloating} className="inline text-[9px]" />
                {symbolVolume > 0 && (
                  <span className="text-[var(--mt5-muted)]">
                    {" "}
                    · {symbolVolume.toFixed(2)} lot
                  </span>
                )}
              </span>
            )}
            {chartSettings.showSlTp && priceLines.some((l) => l.draggable) && (
              <span className="text-[var(--mt5-muted)]">
                Drag SL/TP · Confirm to apply on broker
              </span>
            )}
          </div>
        )}

      {/* Chart fills remaining height on desktop */}
      <div
        ref={chartAreaRef}
        data-mt5-chart-pane
        className={cn(
          "relative h-full min-h-0 w-full flex-1",
          !workspaceLayout &&
            !chartOnly &&
            desktopTerminal &&
            "min-h-[200px]",
        )}
      >
        <ChartUserWatermark
          name={userDisplayName}
          visible={chartSettings.showWatermark && !workspaceLayout}
        />
        {!workspaceLayout && (
        <Mt5ChartSymbolOverlay
          symbol={selectedSymbol}
          timeframe={timeframe}
          liveQuote={liveQuote}
          chartError={chartStatus.error}
          onSymbolClick={focusSymbolSearch}
        />
        )}
        <ChartAlertToastStack
          toasts={alertToasts}
          onDismiss={dismissToast}
        />
        {!workspaceLayout && (
        <div className="absolute left-2 right-2 top-10 z-[12] flex md:hidden">
          <ChartToolsToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onDone={cancelTool}
            alerts={alerts}
            pendingTrend={pendingTrend != null}
            onRemoveAlert={removeAlert}
            onClearTriggered={clearTriggeredAlerts}
          />
        </div>
        )}
        {!workspaceLayout && (
        <Mt5ChartRadialMenu
          open={radialOpen}
          anchor={radialAnchor}
          bounds={chartBounds}
          activeTimeframe={timeframe}
          onClose={() => setRadialOpen(false)}
          onTimeframe={(tf) => {
            handleTimeframeChange(tf);
            setRadialOpen(false);
          }}
          onTool={handleRadialTool}
        />
        )}
        <div
          className={cn(
            "relative z-[2] h-full w-full transition-opacity duration-300",
            chartLoading && chartLoadReason === "timeframe" && "opacity-95",
          )}
        >
          <LightweightChart
            ref={chartRef}
            symbol={selectedSymbol}
            timeframe={timeframe}
            seedPrice={getActiveQuote(selectedSymbol)?.mid ?? liveQuote?.mid ?? liveQuote?.bid}
            getQuote={() => getActiveQuote(selectedSymbol)}
            markers={markers}
            priceLines={chartPriceLines}
            draggableLines={
              canManageTrades &&
              chartSettings.showSlTp &&
              activeTool === "select"
            }
            onPriceLineDragEnd={handlePriceLineDragEnd}
            onChartTap={workspaceLayout ? undefined : handleChartTap}
            chartTool={activeTool}
            onChartPointClick={handleChartPoint}
            drawings={drawings}
            pendingTrend={pendingTrend}
            showDrawings={chartSettings.showDrawings}
            onEraseDrawing={removeDrawing}
            onEraseAlert={removeAlert}
            eraseTargets={eraseTargets}
            className="h-full w-full"
            forceTheme={forceChartTheme}
            onLoadingChange={handleChartLoadingChange}
            onChartStatusChange={setChartStatus}
            focusTime={
              reviewedHistory &&
              reviewedHistory.symbol.toUpperCase() === selectedSymbol.toUpperCase()
                ? historyEntryUnix(reviewedHistory)
                : null
            }
          />
        </div>
        {chartLoading && chartLoadReason === "timeframe" && (
          <div className="pointer-events-none absolute inset-0 bg-[var(--mt5-bg)]/10 transition-opacity duration-300">
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-[var(--mt5-divider)] bg-[var(--mt5-surface)]/95 px-2.5 py-1 text-[10px] font-medium text-[var(--mt5-muted)] shadow-sm backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading {timeframe}…
            </div>
          </div>
        )}
        {chartLoading && chartLoadReason !== "timeframe" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--mt5-bg)]/35 transition-opacity duration-300">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--mt5-muted)]" />
          </div>
        )}
        {!chartLoading && chartStatus.error && (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200/90">
            {chartStatus.source === "quote-fallback"
              ? "Live price only — candle history unavailable. "
              : null}
            {chartStatus.error}
          </div>
        )}
      </div>
        </div>
      </div>

      {desktopTerminal && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize account panel"
          aria-valuemin={Math.round(ACCOUNT_PANEL_MIN * 100)}
          aria-valuemax={Math.round(ACCOUNT_PANEL_MAX * 100)}
          aria-valuenow={Math.round(panelFrac * 100)}
          tabIndex={0}
          onPointerDown={onSplitPointerDown}
          onPointerMove={onSplitPointerMove}
          onPointerUp={onSplitPointerUp}
          onPointerCancel={onSplitPointerUp}
          onDoubleClick={() => setPanelFrac(ACCOUNT_PANEL_FRAC)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setPanelFrac((v) =>
                Math.min(ACCOUNT_PANEL_MAX, v + 0.02),
              );
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setPanelFrac((v) =>
                Math.max(ACCOUNT_PANEL_MIN, v - 0.02),
              );
            } else if (e.key === "Home") {
              e.preventDefault();
              setPanelFrac(ACCOUNT_PANEL_FRAC);
            }
          }}
          className={cn(
            "group relative z-[5] flex h-full cursor-ns-resize touch-none items-center justify-center",
            "border-t border-[var(--mt5-divider)] bg-[var(--mt5-surface)]",
            !workspaceLayout && "hidden md:flex",
            isResizingSplit && "bg-primary/20",
          )}
        >
          <span className="h-1 w-10 rounded-full bg-[var(--mt5-muted)]/50 group-hover:bg-primary/70 group-focus-visible:bg-primary" />
        </div>
      )}

      {/* Desktop MT5-style terminal — hidden on phone */}
      {showOrdersPanel && (
        <div
          className={cn(
            "flex min-h-0 flex-col overflow-hidden border-t border-[var(--mt5-divider)]",
            !workspaceLayout && "hidden md:flex",
          )}
        >
          <div className="grid grid-cols-[1.1fr_0.75fr_0.55fr_0.45fr_0.65fr_0.65fr_0.6fr_0.6fr_0.65fr_0.55fr] gap-2 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
            <span>Symbol</span>
            <span>Ticket</span>
            <span>Type</span>
            <span>Volume</span>
            <span>Price</span>
            <span>Current</span>
            <span>S / L</span>
            <span>T / P</span>
            <span>Profit</span>
            <span className="text-right">Action</span>
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-auto">
            {openOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                <p className="text-sm text-[var(--mt5-muted)]">
                  You don&apos;t have any open positions
                </p>
              </div>
            ) : (
              openOrders.map(({ key, symbol, trade, kind }) => {
                const setup = trade.signalId
                  ? setups.find((s) => s.signalId === trade.signalId)
                  : undefined;
                const ticket = trade.positionId ?? trade.orderId ?? "—";
                const typeLabel =
                  kind === "limit"
                    ? `${trade.direction.toLowerCase()} limit`
                    : trade.direction.toLowerCase();
                const focusedId =
                  focusedTrade?.positionId ?? focusedTrade?.orderId;
                const rowId = trade.positionId ?? trade.orderId;
                const active = Boolean(
                  focusedId && rowId && focusedId === rowId,
                );

                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => openPosition(trade)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        openPosition(trade);
                      }
                    }}
                    className={cn(
                      "grid grid-cols-[1.1fr_0.75fr_0.55fr_0.45fr_0.65fr_0.65fr_0.6fr_0.6fr_0.65fr_0.55fr] gap-2 border-b border-[var(--mt5-divider)] px-3 py-2 text-xs tabular-nums transition-colors hover:bg-[var(--mt5-row-hover)]",
                      active && "bg-[var(--mt5-row-hover)]",
                    )}
                  >
                    <span className="font-semibold text-[var(--mt5-text)]">{symbol}</span>
                    <span className="text-[var(--mt5-muted)]">#{ticket}</span>
                    <span
                      style={{
                        color:
                          trade.direction.toUpperCase() === "BUY"
                            ? MT5_BUY
                            : MT5_SELL,
                      }}
                    >
                      {typeLabel}
                    </span>
                    <span className="font-medium">{trade.volume?.toFixed(2) ?? "—"}</span>
                    <span>{fmtMt5Price(trade.openPrice ?? trade.entryMin)}</span>
                    <span className="font-medium text-[var(--mt5-text)]">
                      {fmtMt5Price(trade.currentPrice ?? trade.openPrice)}
                    </span>
                    <span>{fmtMt5Price(trade.stopLoss)}</span>
                    <span>{fmtMt5Price(trade.takeProfit)}</span>
                    <span>
                      {trade.profit != null ? (
                        <Mt5Pnl value={trade.profit} className="text-xs" />
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="flex justify-end gap-2 text-[10px]">
                      {setup && (
                        <button
                          type="button"
                          className="font-semibold text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenSetup(toSetupSummary(setup));
                          }}
                        >
                          Setup
                        </button>
                      )}
                      {canManageTrades ? (
                      <button
                        type="button"
                        className="font-semibold text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPosition(trade);
                        }}
                      >
                        Modify
                      </button>
                      ) : null}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Account summary bar — MT5 terminal footer */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-2 text-[11px] text-[var(--mt5-muted)]">
            <span>
              Balance:{" "}
              <strong className="text-[var(--mt5-text)]">
                {fmtMt5Price(account?.startingBalance ?? 0)}
              </strong>
            </span>
            <span>
              Equity:{" "}
              <strong className="text-[var(--mt5-text)]">
                {fmtMt5Price(account?.equity ?? account?.startingBalance ?? 0)}
              </strong>
            </span>
            <span>
              Floating:{" "}
              <strong className="text-[var(--mt5-text)]">
                {fmtMt5Price(account?.floatingProfit ?? totalProfit)}
              </strong>
            </span>
            <span className="ml-auto">
              Profit:{" "}
              <Mt5Pnl
                value={account?.totalProfit ?? totalProfit}
                className="inline text-xs"
              />
            </span>
          </div>
          {showTradeBar && orderActionBar}
        </div>
      )}
      </div>

      {chartOnly && orderActionBar}

      {showTradeBar && !showOrdersPanel && !chartOnly && orderActionBar}

      {orderModal && canManageTrades && (
        <Mt5PlaceOrderModal
          symbol={selectedSymbol}
          kind={orderModal}
          volume={orderVolume}
          open
          onClose={() => setOrderModal(null)}
          onPlaced={() => {
            onTradePlaced?.();
            onStopsUpdated?.();
          }}
        />
      )}
      <Mt5PositionModifyModal
        trade={focusedTrade}
        open={modifyOpen}
        canManage={canManageTrades}
        onClose={() => setModifyOpen(false)}
        onChanged={() => {
          onStopsUpdated?.();
          onTradePlaced?.();
        }}
      />
    </div>
  );
}
