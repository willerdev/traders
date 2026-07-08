"use client";

import { useMemo, useRef, useState } from "react";
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
      className={cn(
        "flex shrink-0 flex-col border-b border-[var(--mt5-divider)] bg-[var(--mt5-bg)]",
        showOrdersPanel && "lg:flex-1 lg:min-h-0 lg:border-b-0",
      )}
      data-mt5-chart-terminal
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-2">
        <select
          value={selectedSymbol}
          onChange={(e) => handleSymbolChange(e.target.value)}
          className="max-w-[10rem] rounded border border-[var(--mt5-divider)] bg-[var(--mt5-bg)] px-2 py-1.5 text-xs font-semibold text-[var(--mt5-text)]"
          aria-label="Chart symbol"
        >
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {selectedQuote && (
          <div className="hidden text-xs text-[var(--mt5-muted)] sm:block">
            Bid {fmtMt5Price(selectedQuote.bid)} · Ask{" "}
            {fmtMt5Price(selectedQuote.ask)}
          </div>
        )}

        <div className="flex flex-1 flex-wrap justify-end gap-0.5">
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
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--mt5-muted)]" />
        )}
      </div>

      {/* Chart — taller on desktop */}
      <div
        className={cn(
          "relative w-full",
          showOrdersPanel
            ? "h-[min(42vh,280px)] min-h-[200px] lg:min-h-[320px] lg:flex-1"
            : "h-[min(42vh,280px)] min-h-[200px]",
        )}
      >
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
          className="h-full w-full"
          onLoadingChange={setChartLoading}
        />
      </div>

      {/* Desktop MT5-style terminal — hidden on phone */}
      {showOrdersPanel && (
        <div className="hidden lg:flex lg:min-h-[220px] lg:max-h-[38vh] lg:flex-col lg:border-t lg:border-[var(--mt5-divider)]">
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
