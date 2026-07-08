import type { ChartTimeframe, OHLCBar } from "@/components/charts/chart-types";
import { MAX_HISTORICAL_BARS } from "@/components/charts/chart-types";
import { roundPriceForSymbol, defaultMidForSymbol } from "@/components/charts/chart-price-format";

export { defaultMidForSymbol };

const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
  D1: 86400,
};

const TIMEFRAME_VOL_MULT: Record<ChartTimeframe, number> = {
  M1: 0.35,
  M5: 0.55,
  M15: 0.75,
  H1: 1,
  D1: 2.5,
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

/** Volatility scale by symbol class (placeholder until real tick data). */
function volatilityForSymbol(
  symbol: string,
  mid: number,
  timeframe: ChartTimeframe,
): number {
  const s = symbol.toUpperCase();
  let vol: number;
  if (s.includes("XAU") || s.includes("GOLD")) vol = mid * 0.0012;
  else if (s.includes("BTC")) vol = mid * 0.003;
  else if (s.includes("NAS") || s.includes("US30") || s.includes("US500")) vol = mid * 0.0015;
  else if (s.includes("HZ") || s.startsWith("R_")) vol = mid * 0.002;
  else if (s.includes("JPY")) vol = mid * 0.001;
  else vol = mid * 0.0015;
  return vol * TIMEFRAME_VOL_MULT[timeframe];
}

function buildBar(
  symbol: string,
  time: number,
  open: number,
  close: number,
  vol: number,
  wickSeed: number,
): OHLCBar {
  let o = open;
  let c = close;
  const minBody = vol * 0.25;
  if (Math.abs(c - o) < minBody) {
    c = o + (c >= o ? minBody : -minBody);
  }
  const high = Math.max(o, c) + seededUnit(wickSeed) * vol * 0.45;
  const low = Math.min(o, c) - seededUnit(wickSeed + 1) * vol * 0.45;
  return {
    time,
    open: roundPriceForSymbol(o, symbol),
    high: roundPriceForSymbol(high, symbol),
    low: roundPriceForSymbol(low, symbol),
    close: roundPriceForSymbol(c, symbol),
  };
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
  const vol = volatilityForSymbol(symbol, base, timeframe);
  const bars: OHLCBar[] = [];
  let price = base;

  for (let i = MAX_HISTORICAL_BARS - 1; i >= 0; i -= 1) {
    const t = alignedBarTime(now - i * interval, interval);
    const r1 = seededUnit(symSeed + i * 3);
    const drift = Math.sin((i + symSeed) / 9) * vol * 0.6;
    const open = price;
    const close = open + drift + (r1 - 0.5) * vol;
    bars.push(buildBar(symbol, t, open, close, vol, symSeed + i * 11));
    price = close;
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
  const vol = volatilityForSymbol(symbol, defaultMidForSymbol(symbol), timeframe);
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
      tickIndex += 1;
      simMid += (seededUnit(symSeed + tickIndex) - 0.5) * vol * 0.12;
      mid = simMid;
    } else {
      simMid = mid;
    }

    const now = Math.floor(Date.now() / 1000);
    const barTime = alignedBarTime(now, interval);
    const px = roundPriceForSymbol(mid, symbol);

    if (!lastBar || barTime > lastBarTime) {
      lastBarTime = barTime;
      lastBar = buildBar(symbol, barTime, px, px, vol, symSeed + tickIndex);
      onBar(lastBar, true);
      return;
    }

    if (lastBar) {
      lastBar = buildBar(
        symbol,
        lastBar.time,
        lastBar.open,
        px,
        vol,
        symSeed + tickIndex,
      );
      lastBar.high = roundPriceForSymbol(
        Math.max(lastBar.high, px, lastBar.open),
        symbol,
      );
      lastBar.low = roundPriceForSymbol(
        Math.min(lastBar.low, px, lastBar.open),
        symbol,
      );
      onBar(lastBar, false);
    }
  };

  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
