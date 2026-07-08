import type { ChartTimeframe, OHLCBar } from "@/components/charts/chart-types";
import { MAX_HISTORICAL_BARS } from "@/components/charts/chart-types";

const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
  D1: 86400,
};

function alignedBarTime(nowSec: number, intervalSec: number): number {
  return Math.floor(nowSec / intervalSec) * intervalSec;
}

function seedFromSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i += 1) {
    h = (h * 31 + symbol.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Volatility scale by symbol class (placeholder until real tick data). */
function volatilityForSymbol(symbol: string, mid: number): number {
  const s = symbol.toUpperCase();
  if (s.includes("XAU") || s.includes("GOLD")) return mid * 0.0008;
  if (s.includes("BTC")) return mid * 0.002;
  if (s.includes("NAS") || s.includes("US30") || s.includes("US500")) return mid * 0.001;
  return mid * 0.0003;
}

/**
 * CONNECT BACKEND: replace this mock with
 * GET /signals/mt5/ohlc?symbol={symbol}&timeframe={timeframe}
 * Expected response: { bars: OHLCBar[] }
 */
export async function loadHistoricalOHLC(
  symbol: string,
  timeframe: ChartTimeframe,
  seedPrice?: number | null,
): Promise<OHLCBar[]> {
  const interval = TIMEFRAME_SECONDS[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const base =
    seedPrice && seedPrice > 0
      ? seedPrice
      : 1.08 + (seedFromSymbol(symbol) % 1000) / 10000;
  const vol = volatilityForSymbol(symbol, base);
  const bars: OHLCBar[] = [];
  let price = base;

  for (let i = MAX_HISTORICAL_BARS - 1; i >= 0; i -= 1) {
    const t = alignedBarTime(now - i * interval, interval);
    const drift = (Math.sin((i + seedFromSymbol(symbol)) / 12) * vol) / 2;
    const open = price;
    const close = open + drift + (Math.random() - 0.5) * vol;
    const high = Math.max(open, close) + Math.random() * vol * 0.5;
    const low = Math.min(open, close) - Math.random() * vol * 0.5;
    price = close;
    bars.push({
      time: t,
      open: roundPrice(open, base),
      high: roundPrice(high, base),
      low: roundPrice(low, base),
      close: roundPrice(close, base),
    });
  }

  return bars;
}

function roundPrice(value: number, ref: number): number {
  const digits = ref >= 100 ? 2 : ref >= 10 ? 3 : 5;
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

export type RealtimeQuote = {
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
};

/**
 * CONNECT BACKEND: replace interval stub with WebSocket subscription, e.g.
 * wss://your-api/market/stream?symbol={symbol}&timeframe={timeframe}
 * On each tick/bar message, call onBar(updatedOHLCBar).
 */
export function subscribeRealtimeUpdates(
  symbol: string,
  timeframe: ChartTimeframe,
  getQuote: () => RealtimeQuote | null,
  onBar: (bar: OHLCBar, isNewBar: boolean) => void,
): () => void {
  const interval = TIMEFRAME_SECONDS[timeframe];
  let lastBarTime = alignedBarTime(Math.floor(Date.now() / 1000), interval);
  let lastBar: OHLCBar | null = null;

  const tick = () => {
    const quote = getQuote();
    const mid =
      quote?.mid ??
      (quote?.bid != null && quote?.ask != null
        ? (quote.bid + quote.ask) / 2
        : null);
    if (mid == null || !Number.isFinite(mid)) return;

    const now = Math.floor(Date.now() / 1000);
    const barTime = alignedBarTime(now, interval);
    const px = roundPrice(mid, mid);

    if (!lastBar || barTime > lastBarTime) {
      lastBarTime = barTime;
      lastBar = {
        time: barTime,
        open: px,
        high: px,
        low: px,
        close: px,
      };
      onBar(lastBar, true);
      return;
    }

    if (lastBar) {
      lastBar = {
        ...lastBar,
        high: Math.max(lastBar.high, px),
        low: Math.min(lastBar.low, px),
        close: px,
      };
      onBar(lastBar, false);
    }
  };

  void symbol;
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
