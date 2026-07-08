"use client";

import { useMemo, useRef, useState } from "react";
import type {
  OpenSetupItem,
  UserMt5QuoteItem,
  UserMt5Trade,
} from "@/lib/api";
import type { SetupSummary } from "@/components/dashboard/setup-detail-modal";
import {
  LightweightChart,
  type LightweightChartHandle,
} from "@/components/charts/lightweight-chart";
import {
  CHART_TIMEFRAMES,
  type ChartMarker,
  type ChartPriceLine,
  type ChartTimeframe,
} from "@/components/charts/chart-types";
import {
  MT5_BUY,
  MT5_SELL,
  Mt5DirectionTag,
  Mt5Pnl,
  fmtMt5Price,
} from "@/components/mt5/mt5-ui";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Props = {
  quotes: UserMt5QuoteItem[];
  runningTrades: UserMt5Trade[];
  limitTrades: UserMt5Trade[];
  setups: OpenSetupItem[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenSetup: (setup: SetupSummary) => void;
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

export function Mt5ChartTerminal({
  quotes,
  runningTrades,
  limitTrades,
  setups,
  selectedSymbol,
  onSelectSymbol,
  onOpenSetup,
}: Props) {
  const chartRef = useRef<LightweightChartHandle>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("M5");
  const [chartLoading, setChartLoading] = useState(false);

  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const q of quotes) set.add(q.symbol);
    for (const t of runningTrades) set.add(t.symbol);
    for (const t of limitTrades) set.add(t.symbol);
    if (set.size === 0) set.add(selectedSymbol);
    return Array.from(set).sort();
  }, [quotes, runningTrades, limitTrades, selectedSymbol]);

  const selectedQuote = useMemo(
    () => quotes.find((q) => q.symbol === selectedSymbol) ?? null,
    [quotes, selectedSymbol],
  );

  const openOrders = useMemo(() => {
    const rows: Array<{
      key: string;
      symbol: string;
      trade: UserMt5Trade;
      kind: "running" | "limit";
    }> = [];
    for (const t of runningTrades) {
      rows.push({ key: `run-${t.positionId ?? t.orderId ?? t.symbol}`, symbol: t.symbol, trade: t, kind: "running" });
    }
    for (const t of limitTrades) {
      rows.push({ key: `lim-${t.orderId ?? t.symbol}`, symbol: t.symbol, trade: t, kind: "limit" });
    }
    return rows;
  }, [runningTrades, limitTrades]);

  const symbolOrders = useMemo(
    () => openOrders.filter((o) => o.symbol === selectedSymbol),
    [openOrders, selectedSymbol],
  );

  const { priceLines, markers } = useMemo(() => {
    const lines: ChartPriceLine[] = [];
    const marks: ChartMarker[] = [];
    const barTime = alignedNow(300);

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
  }, [symbolOrders]);

  function handleTimeframeChange(tf: ChartTimeframe) {
    setTimeframe(tf);
    chartRef.current?.setTimeframe(tf);
  }

  function handleSymbolChange(symbol: string) {
    onSelectSymbol(symbol);
    chartRef.current?.setSymbol(symbol);
  }

  return (
    <div
      className="flex shrink-0 flex-col border-b border-[var(--mt5-divider)] bg-[var(--mt5-bg)]"
      data-mt5-chart-terminal
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--mt5-divider)] px-3 py-2">
        <select
          value={selectedSymbol}
          onChange={(e) => handleSymbolChange(e.target.value)}
          className="max-w-[8rem] rounded border border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-2 py-1 text-xs font-semibold text-[var(--mt5-text)]"
          aria-label="Chart symbol"
        >
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex flex-1 flex-wrap gap-1">
          {CHART_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => handleTimeframeChange(tf)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                timeframe === tf
                  ? "bg-primary/20 text-primary"
                  : "text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)]",
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        {chartLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--mt5-muted)]" />
        )}
      </div>

      <div className="relative h-[min(42vh,280px)] min-h-[200px] w-full">
        <LightweightChart
          ref={chartRef}
          symbol={selectedSymbol}
          timeframe={timeframe}
          seedPrice={selectedQuote?.mid ?? selectedQuote?.bid}
          getQuote={() =>
            selectedQuote
              ? {
                  bid: selectedQuote.bid,
                  ask: selectedQuote.ask,
                  mid: selectedQuote.mid,
                }
              : null
          }
          markers={markers}
          priceLines={priceLines}
          className="absolute inset-0 h-full w-full"
          onLoadingChange={setChartLoading}
        />
      </div>

      <div className="border-t border-[var(--mt5-divider)]">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
            Open orders
          </span>
          <span className="text-[10px] text-[var(--mt5-muted)]">
            {openOrders.length} total
          </span>
        </div>

        {openOrders.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-[var(--mt5-muted)]">
            No open positions or pending limits.
          </p>
        ) : (
          <div className="max-h-32 overflow-y-auto">
            {openOrders.map(({ key, symbol, trade, kind }) => {
              const setup = trade.signalId
                ? setups.find((s) => s.signalId === trade.signalId)
                : undefined;
              const active = symbol === selectedSymbol;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSymbolChange(symbol)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 border-t border-[var(--mt5-divider)] px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--mt5-row-hover)]",
                    active && "bg-[var(--mt5-row-hover)]",
                  )}
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--mt5-text)]">{symbol}</span>
                    <span className="ml-2">
                      <Mt5DirectionTag
                        direction={trade.direction}
                        volume={trade.volume}
                        suffix={kind === "limit" ? "limit" : undefined}
                      />
                    </span>
                    <p className="mt-0.5 text-[10px] text-[var(--mt5-muted)]">
                      {fmtMt5Price(trade.openPrice ?? trade.entryMin)} · SL{" "}
                      {fmtMt5Price(trade.stopLoss)} · TP {fmtMt5Price(trade.takeProfit)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {trade.profit != null && (
                      <Mt5Pnl value={trade.profit} className="text-sm" />
                    )}
                    {setup && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSetup(toSetupSummary(setup));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            onOpenSetup(toSetupSummary(setup));
                          }
                        }}
                        className="text-[10px] font-semibold text-primary"
                      >
                        Setup
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
