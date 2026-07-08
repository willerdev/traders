import type { DeepPartial } from "lightweight-charts";
import { ColorType } from "lightweight-charts";
import { MT5_BUY, MT5_SELL } from "@/components/mt5/mt5-ui";

export type ChartThemeMode = "dark" | "light";

const MT5_DARK = {
  background: "#121a2e",
  surface: "#1a2438",
  text: "#e8eaed",
  muted: "#8b95a8",
  grid: "#2a3548",
};

const MT5_LIGHT = {
  background: "#f0f2f5",
  surface: "#ffffff",
  text: "#1a1a2e",
  muted: "#6b7280",
  grid: "#e5e7eb",
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
    },
  };
}

/** Candlestick series colors — buy blue / sell red from MT5 palette. */
export function createCandlestickSeriesOptions(): DeepPartial<
  import("lightweight-charts").CandlestickSeriesOptions
> {
  return {
    upColor: MT5_BUY,
    downColor: MT5_SELL,
    borderUpColor: MT5_BUY,
    borderDownColor: MT5_SELL,
    wickUpColor: MT5_BUY,
    wickDownColor: MT5_SELL,
  };
}
