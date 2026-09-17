import type { DeepPartial } from "lightweight-charts";
import { ColorType } from "lightweight-charts";
import { MT5_BUY, MT5_SELL } from "@/components/mt5/mt5-ui";
import type { SymbolPriceFormat } from "@/components/charts/chart-price-format";

export type ChartThemeMode = "dark" | "light";

const MT5_DARK = {
  background: "#121a2e",
  surface: "#1a2438",
  text: "#e8eaed",
  muted: "#8b95a8",
  grid: "#2a3548",
};

const MT5_LIGHT = {
  background: "#ffffff",
  surface: "#ffffff",
  text: "#1a1a2e",
  muted: "#6b7280",
  grid: "#eef0f4",
};

function palette(mode: ChartThemeMode) {
  return mode === "light" ? MT5_LIGHT : MT5_DARK;
}

/** Lightweight Charts layout + grid options aligned with `.mt5-shell`. */
export function createChartOptions(mode: ChartThemeMode): DeepPartial<import("lightweight-charts").ChartOptions> {
  const p = palette(mode);
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: p.background },
      textColor: p.muted,
      fontFamily: "inherit",
    },
    grid: {
      vertLines: { color: p.grid },
      horzLines: { color: p.grid },
    },
    crosshair: {
      vertLine: { color: p.muted, labelBackgroundColor: p.surface },
      horzLine: { color: p.muted, labelBackgroundColor: p.surface },
    },
    rightPriceScale: {
      borderColor: p.grid,
      textColor: p.text,
    },
    timeScale: {
      borderColor: p.grid,
      timeVisible: true,
      secondsVisible: false,
      /** Thinner candles + more bars visible on screen. */
      barSpacing: 3.5,
      minBarSpacing: 0.8,
      rightOffset: 10,
    },
  };
}

/** Candlestick series colors — green/red on light desk, MT5 blue/red on dark. */
export function createCandlestickSeriesOptions(
  priceFormat?: SymbolPriceFormat,
  mode: ChartThemeMode = "dark",
): DeepPartial<import("lightweight-charts").CandlestickSeriesOptions> {
  const upColor = mode === "light" ? "#22C55E" : MT5_BUY;
  const downColor = mode === "light" ? "#EF4444" : MT5_SELL;
  return {
    upColor,
    downColor,
    borderUpColor: upColor,
    borderDownColor: downColor,
    wickUpColor: upColor,
    wickDownColor: downColor,
    borderVisible: true,
    wickVisible: true,
    ...(priceFormat
      ? {
          priceFormat: {
            type: "price" as const,
            precision: priceFormat.precision,
            minMove: priceFormat.minMove,
          },
        }
      : {}),
  };
}

/** After initial load, zoom to show more candles (wider history window). */
export function applyDefaultVisibleRange(
  chart: import("lightweight-charts").IChartApi,
  barCount: number,
): void {
  if (barCount <= 0) return;
  const ts = chart.timeScale();
  const spacing = 3.5;
  ts.applyOptions({ barSpacing: spacing, minBarSpacing: 0.8 });
  ts.fitContent();
  const visibleBars = Math.min(barCount, 140);
  ts.setVisibleLogicalRange({
    from: Math.max(0, barCount - visibleBars),
    to: barCount + 4,
  });
}
