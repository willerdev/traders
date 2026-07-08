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

function alignedBarTime(nowSec: number, intervalSec: number): number {
  return Math.floor(nowSec / intervalSec) * intervalSec;
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

/** Load live OHLC candles from MetaAPI via backend. */
export async function loadHistoricalOHLC(
  symbol: string,
  timeframe: ChartTimeframe,
  _seedPrice?: number | null,
): Promise<OHLCBar[]> {
  const res = await api.signals.mt5Ohlc(symbol, timeframe, MAX_HISTORICAL_BARS);
  return res.bars;
}

export type RealtimeQuote = {
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
};

/** Live candle updates — tick from MetaAPI quote + periodic candle sync. */
export function subscribeRealtimeUpdates(
  symbol: string,
  timeframe: ChartTimeframe,
  getQuote: () => RealtimeQuote | null,
  onBar: (bar: OHLCBar, isNewBar: boolean) => void,
): () => void {
  const interval = TIMEFRAME_SECONDS[timeframe];
  let lastBar: OHLCBar | null = null;
  let lastBarTime = 0;
  let cancelled = false;

  const applyBar = (bar: OHLCBar, isNew: boolean) => {
    lastBar = bar;
    lastBarTime = bar.time;
    onBar(bar, isNew);
  };

  const syncFromApi = async () => {
    if (cancelled) return;
    try {
      const res = await api.signals.mt5Ohlc(symbol, timeframe, 2);
      const bars = res.bars;
      if (bars.length === 0) return;
      for (let i = 0; i < bars.length; i += 1) {
        const bar = bars[i];
        const isNew = i === bars.length - 1 && bar.time > lastBarTime;
        applyBar(bar, isNew);
      }
    } catch {
      /* keep ticking from live quote */
    }
  };

  void syncFromApi();

  const tick = () => {
    if (cancelled) return;
    const mid = quoteMid(getQuote());
    if (mid == null || !Number.isFinite(mid)) return;
    if (resolveSeedPrice(symbol, mid) == null) return;

    const now = Math.floor(Date.now() / 1000);
    const barTime = alignedBarTime(now, interval);
    const next = mergeLiveTick(symbol, lastBar, barTime, mid);
    const isNew = barTime > lastBarTime;
    applyBar(next, isNew);
  };

  const tickId = window.setInterval(tick, 1000);
  const syncId = window.setInterval(() => void syncFromApi(), 10_000);

  return () => {
    cancelled = true;
    window.clearInterval(tickId);
    window.clearInterval(syncId);
  };
}
