"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  OpenSetupItem,
  UserMt5AccountSummary,
  UserMt5AccountSource,
  UserMt5InvestorSummary,
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
import type { RealtimeQuote } from "@/components/charts/chart-data.service";
import { useChartWatchlist } from "@/components/charts/use-chart-watchlist";
import { buildMt5ChartOverlays } from "@/components/mt5/build-mt5-chart-overlays";
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
  Mt5DirectionTag,
  Mt5Pnl,
  Mt5AccountModeBadge,
  fmtMt5Price,
} from "@/components/mt5/mt5-ui";
import {
  mt5AccountModeDetail,
  mt5AccountModeFromSource,
} from "@/lib/mt5-account-mode";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Props = {
  quotes: UserMt5QuoteItem[];
  runningTrades: UserMt5Trade[];
  limitTrades: UserMt5Trade[];
  setups: OpenSetupItem[];
  account?: UserMt5AccountSummary;
  accountSource?: UserMt5AccountSource;
  investor?: UserMt5InvestorSummary;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenSetup: (setup: SetupSummary) => void;
  onCloseTrade?: (trade: UserMt5Trade) => void;
  showOrdersPanel?: boolean;
  /** Mobile Charts tab — chart fills viewport, no orders panel height cap */
  chartOnly?: boolean;
  onStopsUpdated?: () => void;
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
  investor,
  selectedSymbol,
  onSelectSymbol,
  onOpenSetup,
  onCloseTrade,
  showOrdersPanel = true,
  chartOnly = false,
  onStopsUpdated,
}: Props) {
  const chartRef = useRef<LightweightChartHandle>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
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
  const userDisplayName = useAuthStore((s) => s.user?.displayName ?? "");
  const [fetchedQuotes, setFetchedQuotes] = useState<
    Record<string, RealtimeQuote>
  >({});

  const selectedQuote = useMemo(
    () => quotes.find((q) => q.symbol === selectedSymbol) ?? null,
    [quotes, selectedSymbol],
  );

  const liveQuote = useMemo((): RealtimeQuote | null => {
    if (
      selectedQuote?.bid != null &&
      selectedQuote?.ask != null &&
      selectedQuote?.mid != null
    ) {
      return {
        bid: selectedQuote.bid,
        ask: selectedQuote.ask,
        mid: selectedQuote.mid,
      };
    }
    return fetchedQuotes[selectedSymbol] ?? null;
  }, [selectedQuote, fetchedQuotes, selectedSymbol]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const q = await api.signals.mt5Quote(selectedSymbol);
        if (cancelled) return;
        setFetchedQuotes((prev) => ({
          ...prev,
          [selectedSymbol]: {
            bid: q.bid,
            ask: q.ask,
            mid: q.mid,
          },
        }));
      } catch {
        /* chart sync continues when quote unavailable */
      }
    }

    void poll();
    const id = window.setInterval(poll, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selectedSymbol]);

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
        options: {
          showOrders: chartSettings.showOrders,
          showLimits: chartSettings.showLimits,
          showSlTp: chartSettings.showSlTp,
        },
      }),
    [
      selectedSymbol,
      timeframe,
      runningTrades,
      limitTrades,
      setups,
      chartSettings.showOrders,
      chartSettings.showLimits,
      chartSettings.showSlTp,
    ],
  );

  function handleTimeframeChange(tf: ChartTimeframe) {
    setTimeframe(tf);
  }

  function handleSymbolChange(symbol: string) {
    onSelectSymbol(symbol);
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

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-[var(--mt5-bg)]",
        chartOnly
          ? "h-full min-h-0 flex-1 overflow-hidden pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0"
          : desktopTerminal
            ? "shrink-0 border-b border-[var(--mt5-divider)] md:min-h-0 md:flex-1 md:overflow-hidden md:border-b-0"
            : "h-full min-h-0 flex-1 overflow-hidden",
      )}
      data-mt5-chart-terminal
    >
      {/* Toolbar — pair search + settings (timeframes via radial on chart) */}
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

        {overlaySummary.total > 0 && (
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
        className={cn(
          "relative w-full",
          chartOnly
            ? "min-h-0 flex-1"
            : desktopTerminal
              ? "min-h-[200px] h-[min(42vh,280px)] flex-1 lg:min-h-0"
              : "min-h-0 flex-1",
        )}
      >
        <ChartUserWatermark
          name={userDisplayName}
          visible={chartSettings.showWatermark}
        />
        <Mt5ChartSymbolOverlay
          symbol={selectedSymbol}
          timeframe={timeframe}
          liveQuote={liveQuote}
          chartError={chartStatus.error}
          onSymbolClick={focusSymbolSearch}
        />
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
            seedPrice={liveQuote?.mid ?? liveQuote?.bid}
            getQuote={() => liveQuote}
            markers={markers}
            priceLines={priceLines}
            draggableLines={chartSettings.showSlTp}
            onPriceLineDragEnd={handlePriceLineDragEnd}
            onChartTap={handleChartTap}
            className="h-full w-full"
            onLoadingChange={handleChartLoadingChange}
            onChartStatusChange={setChartStatus}
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

      {/* Desktop MT5-style terminal — hidden on phone */}
      {showOrdersPanel && (
        <div className="hidden md:flex md:max-h-[32vh] md:shrink-0 md:flex-col md:border-t md:border-[var(--mt5-divider)]">
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

          <div className="flex-1 overflow-y-auto">
            {openOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <p className="text-sm text-[var(--mt5-muted)]">
                  You don&apos;t have any open positions
                </p>
              </div>
            ) : (
              openOrders.map(({ key, symbol, trade, kind }) => {
                const setup = trade.signalId
                  ? setups.find((s) => s.signalId === trade.signalId)
                  : undefined;
                const active = symbol === selectedSymbol;
                const ticket = trade.positionId ?? trade.orderId ?? "—";
                const typeLabel =
                  kind === "limit"
                    ? `${trade.direction.toLowerCase()} limit`
                    : trade.direction.toLowerCase();

                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSymbolChange(symbol)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") handleSymbolChange(symbol);
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
                      {kind === "running" && onCloseTrade && (
                        <button
                          type="button"
                          className="font-semibold text-[#ff5252] hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCloseTrade(trade);
                          }}
                        >
                          Close
                        </button>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Account summary bar — MT5 terminal footer */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-2 text-[11px] text-[var(--mt5-muted)]">
            <Mt5AccountModeBadge
              mode={mt5AccountModeFromSource(accountSource, investor)}
              detail={
                mt5AccountModeDetail(accountSource) ??
                (investor?.investmentDeposited ? "Investor" : null)
              }
              className="mr-1"
            />
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
        </div>
      )}
    </div>
  );
}
