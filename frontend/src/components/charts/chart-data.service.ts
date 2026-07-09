import type { ChartTimeframe, OHLCBar } from "@/components/charts/chart-types";
import { MAX_HISTORICAL_BARS } from "@/components/charts/chart-types";
import { roundPriceForSymbol, defaultMidForSymbol } from "@/components/charts/chart-price-format";
import { api } from "@/lib/api";

export { defaultMidForSymbol };

const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
  D1: 86400,
};

const TIMEFRAME_VOL_MULT: Record<ChartTimeframe, number> = {
  M1: 0.1,
  M5: 0.14,
  M15: 0.18,
  H1: 0.28,
  D1: 0.45,
};

const INITIAL_OHLC_LIMIT = 400;
const FALLBACK_BAR_COUNT = 280;
const VISIBILITY_RESYNC_LIMIT = 120;

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

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Reject quote seeds from a previously selected symbol (e.g. EURUSD mid on BTC). */
export function resolveSeedPrice(
  symbol: string,
  seed?: number | null,
): number | undefined {
  if (seed == null || !Number.isFinite(seed) || seed <= 0) return undefined;
  const ref = defaultMidForSymbol(symbol);
  const ratio = seed / ref;
  if (ratio >= 0.5 && ratio <= 2) return seed;
  return undefined;
}

function volatilityForSymbol(
  symbol: string,
  mid: number,
  timeframe: ChartTimeframe,
): number {
  const s = symbol.toUpperCase();
  let vol: number;
  if (s.includes("XAU") || s.includes("GOLD")) vol = mid * 0.00035;
  else if (s.includes("BTC")) vol = mid * 0.0008;
  else if (s.includes("NAS") || s.includes("US30") || s.includes("US500")) vol = mid * 0.00045;
  else if (s.includes("HZ") || s.startsWith("R_")) vol = mid * 0.00055;
  else if (s.includes("JPY")) vol = mid * 0.0003;
  else vol = mid * 0.00035;
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
  const o = open;
  let c = close;
  const flatThreshold = vol * 0.015;
  if (Math.abs(c - o) < flatThreshold) {
    c = o + (seededUnit(wickSeed + 2) - 0.5) * vol * 0.06;
  }
  const bodyTop = Math.max(o, c);
  const bodyBot = Math.min(o, c);
  const wickUp = seededUnit(wickSeed) * vol * 0.14;
  const wickDown = seededUnit(wickSeed + 1) * vol * 0.14;
  const high = bodyTop + wickUp;
  const low = bodyBot - wickDown;
  return {
    time,
    open: roundPriceForSymbol(o, symbol),
    high: roundPriceForSymbol(high, symbol),
    low: roundPriceForSymbol(low, symbol),
    close: roundPriceForSymbol(c, symbol),
  };
}

/** Fallback bars anchored to a live MetaAPI quote when candle history is unavailable. */
function buildQuoteSeededBars(
  symbol: string,
  timeframe: ChartTimeframe,
  seedPrice: number,
  barCount = FALLBACK_BAR_COUNT,
): OHLCBar[] {
  const interval = TIMEFRAME_SECONDS[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const symSeed = seedFromSymbol(symbol);
  const mean = seedPrice;
  const vol = volatilityForSymbol(symbol, mean, timeframe);
  const bars: OHLCBar[] = [];
  let price = mean;

  for (let i = barCount - 1; i >= 0; i -= 1) {
    const t = alignedBarTime(now - i * interval, interval);
    const open = price;
    const reversion = (mean - price) * 0.012;
    const micro =
      (seededUnit(symSeed + i * 7) - 0.5) * vol * 0.22 +
      (seededUnit(symSeed + i * 13) - 0.5) * vol * 0.12;
    const slowTrend = Math.sin((i + symSeed) / 28) * vol * 0.08;
    const close = open + reversion + micro + slowTrend;
    bars.push(buildBar(symbol, t, open, close, vol, symSeed + i * 11));
    price = close;
  }

  return bars;
}

function quoteMid(quote: RealtimeQuote | null): number | null {
  if (!quote) return null;
  if (quote.mid != null && Number.isFinite(quote.mid)) return quote.mid;
  if (
    quote.bid != null &&
    quote.ask != null &&
    Number.isFinite(quote.bid) &&
    Number.isFinite(quote.ask)
  ) {
    return (quote.bid + quote.ask) / 2;
  }
  return null;
}

function mergeLiveTick(
  symbol: string,
  lastBar: OHLCBar | null,
  barTime: number,
  mid: number,
): OHLCBar {
  const px = roundPriceForSymbol(mid, symbol);
  if (!lastBar || lastBar.time < barTime) {
    return {
      time: barTime,
      open: px,
      high: px,
      low: px,
      close: px,
    };
  }
  if (lastBar.time > barTime) {
    return lastBar;
  }
  return {
    time: barTime,
    open: lastBar.open,
    high: roundPriceForSymbol(Math.max(lastBar.high, px), symbol),
    low: roundPriceForSymbol(Math.min(lastBar.low, px), symbol),
    close: px,
  };
}

export type ChartDataLoadResult = {
  bars: OHLCBar[];
  source: "metaapi" | "quote-fallback";
  error?: string;
};

async function loadLiveQuoteMid(symbol: string): Promise<number | null> {
  try {
    const q = await api.signals.mt5Quote(symbol);
    return q.mid;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("Chart data request timed out")),
      ms,
    );
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

/** Load OHLC from MetaAPI; fall back to quote-anchored bars if history is slow/unavailable. */
export async function loadChartData(
  symbol: string,
  timeframe: ChartTimeframe,
  seedPrice?: number | null,
): Promise<ChartDataLoadResult> {
  try {
    const res = await withTimeout(
      api.signals.mt5Ohlc(symbol, timeframe, INITIAL_OHLC_LIMIT),
      25_000,
    );
    if (res.bars.length > 0) {
      return { bars: res.bars, source: "metaapi" };
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load MetaAPI candles";
    const seed =
      resolveSeedPrice(symbol, seedPrice) ??
      resolveSeedPrice(symbol, await loadLiveQuoteMid(symbol));
    if (seed != null) {
      return {
        bars: buildQuoteSeededBars(symbol, timeframe, seed),
        source: "quote-fallback",
        error: message,
      };
    }
    return { bars: [], source: "quote-fallback", error: message };
  }

  const seed =
    resolveSeedPrice(symbol, seedPrice) ??
    resolveSeedPrice(symbol, await loadLiveQuoteMid(symbol));
  if (seed != null) {
    return {
      bars: buildQuoteSeededBars(symbol, timeframe, seed),
      source: "quote-fallback",
      error: "MetaAPI returned no candles for this symbol",
    };
  }

  return {
    bars: [],
    source: "quote-fallback",
    error: "No live price available for this symbol",
  };
}

/** @deprecated Use loadChartData — kept for callers expecting OHLCBar[] only. */
export async function loadHistoricalOHLC(
  symbol: string,
  timeframe: ChartTimeframe,
  seedPrice?: number | null,
): Promise<OHLCBar[]> {
  const result = await loadChartData(symbol, timeframe, seedPrice);
  return result.bars;
}

export type RealtimeQuote = {
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
};

/** Live candle updates — tick from MetaAPI quote + periodic last-bar sync. */
export function subscribeRealtimeUpdates(
  symbol: string,
  timeframe: ChartTimeframe,
  getQuote: () => RealtimeQuote | null,
  onBar: (bar: OHLCBar, isNewBar: boolean) => void,
  options?: {
    isActive?: () => boolean;
    onResync?: (bars: OHLCBar[]) => void;
  },
): () => void {
  const interval = TIMEFRAME_SECONDS[timeframe];
  let lastBar: OHLCBar | null = null;
  let lastBarTime = 0;
  let cancelled = false;
  let resyncing = false;
  let tabHidden = typeof document !== "undefined" && document.hidden;

  const canRun = () => !cancelled && (options?.isActive?.() ?? true);

  const applyBar = (bar: OHLCBar, isNew: boolean) => {
    if (!canRun() || resyncing) return;
    lastBar = bar;
    lastBarTime = bar.time;
    onBar(bar, isNew);
  };

  /** Refresh recent candles after tab sleep or drift — replaces tail via onResync. */
  const resyncRecentBarsFromApi = async () => {
    if (!canRun()) return;
    resyncing = true;
    try {
      const res = await api.signals.mt5Ohlc(symbol, timeframe, VISIBILITY_RESYNC_LIMIT);
      const bars = res.bars;
      if (bars.length === 0) return;

      lastBar = bars[bars.length - 1];
      lastBarTime = lastBar.time;
      options?.onResync?.(bars);
    } catch {
      /* keep ticking from live quote */
    } finally {
      resyncing = false;
    }
  };

  /** Refresh only the latest closed + forming bars — never replace full history. */
  const syncLastBarsFromApi = async () => {
    if (!canRun() || tabHidden) return;
    try {
      const res = await api.signals.mt5Ohlc(symbol, timeframe, 2);
      const bars = res.bars;
      if (bars.length === 0) return;
      for (const bar of bars) {
        const isNew = bar.time > lastBarTime;
        applyBar(bar, isNew);
      }
    } catch {
      /* keep ticking from live quote */
    }
  };

  const tick = () => {
    if (!canRun() || tabHidden || resyncing) return;
    const mid = quoteMid(getQuote());
    if (mid == null || !Number.isFinite(mid)) return;

    const now = Math.floor(Date.now() / 1000);
    const barTime = alignedBarTime(now, interval);
    const next = mergeLiveTick(symbol, lastBar, barTime, mid);
    const isNew = barTime > lastBarTime;
    applyBar(next, isNew);
  };

  const onVisibilityChange = () => {
    const wasHidden = tabHidden;
    tabHidden = document.hidden;
    if (wasHidden && !tabHidden) {
      void resyncRecentBarsFromApi();
    }
  };

  const tickId = window.setInterval(tick, 1000);
  const syncId = window.setInterval(() => void syncLastBarsFromApi(), 15_000);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    cancelled = true;
    window.clearInterval(tickId);
    window.clearInterval(syncId);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
