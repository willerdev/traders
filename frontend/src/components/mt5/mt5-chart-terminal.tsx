"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  OpenSetupItem,
  UserMt5AccountSummary,
  UserMt5QuoteItem,
  UserMt5Trade,
} from "@/lib/api";
import type { SetupSummary } from "@/components/dashboard/setup-detail-modal";
import {
  LightweightChart,
  type LightweightChartHandle,
} from "@/components/charts/lightweight-chart";
import { ChartSymbolPicker } from "@/components/charts/chart-symbol-picker";
import {
  CHART_TIMEFRAMES,
  type ChartMarker,
  type ChartPriceLine,
  type ChartTimeframe,
} from "@/components/charts/chart-types";
import type { RealtimeQuote } from "@/components/charts/chart-data.service";
import { useChartWatchlist } from "@/components/charts/use-chart-watchlist";
import {
  MT5_BUY,
  MT5_SELL,
  Mt5DirectionTag,
  Mt5Pnl,
  fmtMt5Price,
} from "@/components/mt5/mt5-ui";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
  D1: 86400,
};

type Props = {
  quotes: UserMt5QuoteItem[];
  runningTrades: UserMt5Trade[];
  limitTrades: UserMt5Trade[];
  setups: OpenSetupItem[];
  account?: UserMt5AccountSummary;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenSetup: (setup: SetupSummary) => void;
  onCloseTrade?: (trade: UserMt5Trade) => void;
  showOrdersPanel?: boolean;
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

function alignedNow(intervalSec: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor(now / intervalSec) * intervalSec;
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
  selectedSymbol,
  onSelectSymbol,
  onOpenSetup,
  onCloseTrade,
  showOrdersPanel = true,
}: Props) {
  const chartRef = useRef<LightweightChartHandle>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("M5");
  const [chartLoading, setChartLoading] = useState(false);
  const { watchlist, addSymbol, removeSymbol } = useChartWatchlist();
  const [fetchedQuotes, setFetchedQuotes] = useState<
    Record<string, RealtimeQuote>
  >({});

  const selectedQuote = useMemo(
    () => quotes.find((q) => q.symbol === selectedSymbol) ?? null,
    [quotes, selectedSymbol],
  );

  const liveQuote = useMemo((): RealtimeQuote | null => {
    if (selectedQuote) {
      return {
        bid: selectedQuote.bid,
        ask: selectedQuote.ask,
        mid: selectedQuote.mid,
      };
    }
    return fetchedQuotes[selectedSymbol] ?? null;
  }, [selectedQuote, fetchedQuotes, selectedSymbol]);

  useEffect(() => {
    if (selectedQuote) return;
    let cancelled = false;

    async function poll() {
      try {
        const q = await api.signals.quote(selectedSymbol);
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
        /* mock ticks continue when quote unavailable */
      }
    }

    void poll();
    const id = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selectedSymbol, selectedQuote]);

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

  const totalProfit = useMemo(
    () => openOrders.reduce((sum, o) => sum + (o.trade.profit ?? 0), 0),
    [openOrders],
  );

  const { priceLines, markers } = useMemo(() => {
    const lines: ChartPriceLine[] = [];
    const marks: ChartMarker[] = [];
    const barTime = alignedNow(TIMEFRAME_SECONDS[timeframe]);

    for (const { trade, kind } of symbolOrders) {
      const isBuy = trade.direction.toUpperCase() === "BUY";
      const dirColor = isBuy ? MT5_BUY : MT5_SELL;
      const id = trade.positionId ?? trade.orderId ?? trade.symbol;

      if (trade.stopLoss != null) {
        lines.push({
          id: `${id}-sl`,
          price: trade.stopLoss,
          color: MT5_SELL,
          title: "SL",
          lineStyle: 2,
        });
      }
      if (trade.takeProfit != null) {
        lines.push({
          id: `${id}-tp`,
          price: trade.takeProfit,
          color: MT5_BUY,
          title: "TP",
          lineStyle: 2,
        });
      }
      const entry =
        trade.openPrice ??
        (trade.entryMin != null && trade.entryMax != null
          ? (trade.entryMin + trade.entryMax) / 2
          : trade.entryMin ?? trade.entryMax);
      if (entry != null) {
        lines.push({
          id: `${id}-entry`,
          price: entry,
          color: dirColor,
          title: kind === "limit" ? "Limit" : "Entry",
          lineStyle: 0,
        });
      }

      marks.push({
        time: barTime,
        position: isBuy ? "belowBar" : "aboveBar",
        color: dirColor,
        shape: isBuy ? "arrowUp" : "arrowDown",
        text: kind === "limit" ? "Limit" : "Open",
      });
    }

    return { priceLines: lines, markers: marks };
  }, [symbolOrders, timeframe]);

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

  return (
    <div
      className={cn(
        "flex flex-col bg-[var(--mt5-bg)]",
        showOrdersPanel
          ? "lg:min-h-0 lg:flex-1 lg:overflow-hidden"
          : "shrink-0 border-b border-[var(--mt5-divider)]",
      )}
      data-mt5-chart-terminal
    >
      {/* Compact toolbar — pair + timeframe only */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-2 py-1.5 lg:px-3">
        <ChartSymbolPicker
          compact
          selectedSymbol={selectedSymbol}
          watchlist={watchlist}
          onSelect={handleSymbolChange}
          onAdd={handleAddSymbol}
          onRemove={removeSymbol}
          className="min-w-0 flex-1"
        />

        <div className="flex shrink-0 gap-0.5">
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

        {chartLoading && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--mt5-muted)]" />
        )}
      </div>

      {/* Chart fills remaining height on desktop */}
      <div
        className={cn(
          "relative min-h-[200px] w-full flex-1",
          showOrdersPanel
            ? "h-[min(42vh,280px)] lg:min-h-0"
            : "h-[min(42vh,280px)]",
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
          className="h-full w-full"
          onLoadingChange={setChartLoading}
        />
      </div>

      {/* Desktop MT5-style terminal — hidden on phone */}
      {showOrdersPanel && (
        <div className="hidden lg:flex lg:max-h-[32vh] lg:shrink-0 lg:flex-col lg:border-t lg:border-[var(--mt5-divider)]">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.6fr_0.5fr_0.7fr_0.7fr_0.7fr_0.7fr_0.6fr] gap-2 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
            <span>Symbol</span>
            <span>Ticket</span>
            <span>Type</span>
            <span>Volume</span>
            <span>Price</span>
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
                      "grid grid-cols-[1.2fr_0.8fr_0.6fr_0.5fr_0.7fr_0.7fr_0.7fr_0.7fr_0.6fr] gap-2 border-b border-[var(--mt5-divider)] px-3 py-2 text-xs tabular-nums transition-colors hover:bg-[var(--mt5-row-hover)]",
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
                    <span>{trade.volume?.toFixed(2) ?? "—"}</span>
                    <span>{fmtMt5Price(trade.openPrice ?? trade.entryMin)}</span>
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
