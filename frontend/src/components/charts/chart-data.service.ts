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

/** Deterministic 0–1 value — same inputs always produce the same output. */
function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Default mid price when no live quote exists yet. */
export function defaultMidForSymbol(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("XAU") || s.includes("GOLD")) return 2650;
  if (s.includes("BTC")) return 68000;
  if (s.includes("ETH")) return 3400;
  if (s.includes("NAS") || s.includes("US100")) return 18500;
  if (s.includes("US30")) return 39500;
  if (s.includes("JPY")) return 155;
  if (s.includes("HZ") || s.startsWith("R_") || s.startsWith("V")) return 6500;
  return 1.08 + (seedFromSymbol(symbol) % 1000) / 10000;
}

/** Volatility scale by symbol class (placeholder until real tick data). */
function volatilityForSymbol(symbol: string, mid: number): number {
  const s = symbol.toUpperCase();
  if (s.includes("XAU") || s.includes("GOLD")) return mid * 0.0008;
  if (s.includes("BTC")) return mid * 0.002;
  if (s.includes("NAS") || s.includes("US30") || s.includes("US500")) return mid * 0.001;
  if (s.includes("HZ") || s.startsWith("R_")) return mid * 0.0015;
  return mid * 0.0003;
}

function roundPrice(value: number, ref: number): number {
  const digits = ref >= 1000 ? 2 : ref >= 100 ? 2 : ref >= 10 ? 3 : 5;
  const m = 10 ** digits;
  return Math.round(value * m) / m;
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
  const symSeed = seedFromSymbol(symbol);
  const base =
    seedPrice && seedPrice > 0 ? seedPrice : defaultMidForSymbol(symbol);
  const vol = volatilityForSymbol(symbol, base);
  const bars: OHLCBar[] = [];
  let price = base;

  for (let i = MAX_HISTORICAL_BARS - 1; i >= 0; i -= 1) {
    const t = alignedBarTime(now - i * interval, interval);
    const r1 = seededUnit(symSeed + i * 3);
    const r2 = seededUnit(symSeed + i * 7 + 1);
    const drift = (Math.sin((i + symSeed) / 12) * vol) / 2;
    const open = price;
    const close = open + drift + (r1 - 0.5) * vol;
    const high = Math.max(open, close) + r2 * vol * 0.5;
    const low = Math.min(open, close) - seededUnit(symSeed + i * 11) * vol * 0.5;
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
  const symSeed = seedFromSymbol(symbol);
  let lastBarTime = alignedBarTime(Math.floor(Date.now() / 1000), interval);
  let lastBar: OHLCBar | null = null;
  let simMid = defaultMidForSymbol(symbol);
  let tickIndex = 0;

  const tick = () => {
    const quote = getQuote();
    let mid =
      quote?.mid ??
      (quote?.bid != null && quote?.ask != null
        ? (quote.bid + quote.ask) / 2
        : null);

    if (mid == null || !Number.isFinite(mid)) {
      const vol = volatilityForSymbol(symbol, simMid);
      tickIndex += 1;
      simMid += (seededUnit(symSeed + tickIndex) - 0.5) * vol * 0.35;
      mid = simMid;
    } else {
      simMid = mid;
    }

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

  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
