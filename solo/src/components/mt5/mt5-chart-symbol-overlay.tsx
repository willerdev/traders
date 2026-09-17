"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  displayTitleForSymbol,
  resolveMarketStatus,
} from "@/lib/chart-market-status";
import type { ChartTimeframe } from "@/components/charts/chart-types";
import type { RealtimeQuote } from "@/components/charts/chart-data.service";

type Props = {
  symbol: string;
  timeframe: ChartTimeframe;
  liveQuote: RealtimeQuote | null;
  chartError?: string | null;
  onSymbolClick?: () => void;
  className?: string;
};

export function Mt5ChartSymbolOverlay({
  symbol,
  timeframe,
  liveQuote,
  chartError,
  onSymbolClick,
  className,
}: Props) {
  const title = displayTitleForSymbol(symbol);
  const market = resolveMarketStatus(symbol, liveQuote, chartError);
  const marketOpen = market === "open";

  return (
    <div
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-[11] max-w-[min(70%,14rem)] px-2.5 py-2",
        className,
      )}
    >
      <button
        type="button"
        onClick={onSymbolClick}
        className={cn(
          "pointer-events-auto text-left",
          onSymbolClick && "rounded-md pr-1 active:bg-[var(--mt5-row-hover)]/50",
        )}
        disabled={!onSymbolClick}
      >
        <div className="flex items-center gap-1 leading-none">
          <span className="text-sm font-semibold text-[#4a9eff]">{symbol}</span>
          <span className="text-[10px] text-[var(--mt5-muted)]">,</span>
          <span className="text-sm font-semibold text-[var(--mt5-text)]">
            {timeframe}
          </span>
          {onSymbolClick && (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--mt5-muted)]" />
          )}
        </div>
        <p className="mt-1 text-[11px] leading-tight text-[var(--mt5-text)]">
          {title}
        </p>
        <p
          className={cn(
            "mt-0.5 text-[11px] leading-tight",
            marketOpen ? "text-[var(--mt5-muted)]" : "text-amber-400/90",
          )}
        >
          {marketOpen ? "Market open" : "Market closed"}
        </p>
      </button>
    </div>
  );
}
