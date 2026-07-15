/** Shared OHLC / live-tick helpers — keep in sync with frontend chart-data.service.ts */

export type ChartTimeframe = "M1" | "M5" | "M15" | "H1" | "H4" | "D1";

export type OhlcBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

export function alignedBarTime(nowSec: number, intervalSec: number): number {
  return Math.floor(nowSec / intervalSec) * intervalSec;
}

function isSyntheticSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return (
    /^1HZ\d+V$/.test(s) ||
    /^R_\d+$/.test(s) ||
    /^(BOOM|CRASH)\d+N?$/.test(s) ||
    /^JD\d+$/.test(s) ||
    s.includes("HZ") ||
    s.startsWith("STPRNG") ||
    s.startsWith("RDBEAR") ||
    s.startsWith("RDBULL")
  );
}

/** History sanitization — reject clearly cross-symbol / corrupt outliers. */
function maxPriceJumpRatio(symbol: string, anchored: boolean): number {
  if (anchored) {
    return isSyntheticSymbol(symbol) ? 0.12 : 0.05;
  }
  return isSyntheticSymbol(symbol) ? 0.55 : 0.4;
}

/**
 * Live tick updates can move faster than historical bar-to-bar jumps
 * (esp. volatility indices). Use a wider window so the chart keeps stepping.
 */
function maxLiveTickJumpRatio(symbol: string): number {
  return isSyntheticSymbol(symbol) ? 0.35 : 0.12;
}

export function defaultMidForSymbol(symbol: string): number {
  const s = symbol.toUpperCase();
  const volLevel = s.match(/(?:1HZ|HZ|R_)(\d+)/);
  if (volLevel) {
    const level = Number(volLevel[1]);
    const volMids: Record<number, number> = {
      10: 5500,
      15: 4800,
      25: 3200,
      30: 3800,
      50: 4100,
      75: 6750,
      90: 9500,
      100: 800,
      150: 1200,
      200: 900,
      250: 700,
      300: 600,
    };
    if (volMids[level] != null) return volMids[level];
    return 6500;
  }
  if (s.includes("XAU") || s.includes("GOLD")) return 4100;
  if (s.includes("BTC")) return 95000;
  if (s.includes("NAS") || s.includes("US100")) return 18000;
  if (s.includes("JPY")) return 155;
  return 1.08;
}

export function roundPriceForSymbol(price: number, symbol: string): number {
  if (!Number.isFinite(price)) return price;
  const s = symbol.toUpperCase();
  if (s.includes("XAU") || s.includes("GOLD") || s.includes("NAS") || s.includes("BTC")) {
    return Math.round(price * 100) / 100;
  }
  if (isSyntheticSymbol(s)) return Math.round(price * 100) / 100;
  if (s.includes("JPY")) return Math.round(price * 1000) / 1000;
  return Math.round(price * 100000) / 100000;
}

export function isPlausibleQuotePrice(
  symbol: string,
  price: number,
  anchor?: number | null,
  opts?: { live?: boolean },
): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  const anchored = anchor != null && Number.isFinite(anchor) && anchor > 0;
  const ref = anchored ? (anchor as number) : defaultMidForSymbol(symbol);
  const ratio = price / ref;
  const jump = opts?.live
    ? maxLiveTickJumpRatio(symbol)
    : maxPriceJumpRatio(symbol, anchored);
  const minRatio = anchored ? 1 - jump : 0.2;
  const maxRatio = anchored ? 1 + jump : 5;
  return ratio >= minRatio && ratio <= maxRatio;
}

export function sanitizeOhlcBar(
  symbol: string,
  bar: OhlcBar,
  anchor?: number | null,
): OhlcBar {
  const ref =
    anchor != null && Number.isFinite(anchor) && anchor > 0
      ? anchor
      : bar.close;
  const jump = maxPriceJumpRatio(symbol, true);

  const clampField = (value: number, fallback: number): number => {
    if (!Number.isFinite(value) || value <= 0) {
      return roundPriceForSymbol(fallback, symbol);
    }
    if (isPlausibleQuotePrice(symbol, value, ref)) {
      return roundPriceForSymbol(value, symbol);
    }
    const bounded = Math.min(
      Math.max(value, ref * (1 - jump)),
      ref * (1 + jump),
    );
    return roundPriceForSymbol(bounded, symbol);
  };

  const open = clampField(bar.open, ref);
  const close = clampField(bar.close, ref);
  const bodyTop = Math.max(open, close);
  const bodyBot = Math.min(open, close);

  let high = clampField(bar.high, bodyTop);
  let low = clampField(bar.low, bodyBot);
  high = roundPriceForSymbol(Math.max(high, bodyTop), symbol);
  low = roundPriceForSymbol(Math.min(low, bodyBot), symbol);

  return { time: bar.time, open, high, low, close };
}

export function sanitizeOhlcBars(symbol: string, bars: OhlcBar[]): OhlcBar[] {
  if (bars.length === 0) return bars;
  const out: OhlcBar[] = [];
  for (const bar of bars) {
    const anchor = out.length > 0 ? out[out.length - 1].close : null;
    out.push(sanitizeOhlcBar(symbol, bar, anchor));
  }
  return out;
}

/** Merge a live mid into the forming candle, or open a new one on period rollover. */
export function mergeLiveTick(
  symbol: string,
  lastBar: OhlcBar | null,
  barTime: number,
  mid: number,
): OhlcBar {
  if (lastBar && !isPlausibleQuotePrice(symbol, mid, lastBar.close, { live: true })) {
    return lastBar;
  }

  const px = roundPriceForSymbol(mid, symbol);
  if (!lastBar || lastBar.time < barTime) {
    return sanitizeOhlcBar(
      symbol,
      { time: barTime, open: px, high: px, low: px, close: px },
      lastBar?.close ?? px,
    );
  }
  if (lastBar.time > barTime) {
    return lastBar;
  }
  return sanitizeOhlcBar(
    symbol,
    {
      time: barTime,
      open: lastBar.open,
      high: roundPriceForSymbol(Math.max(lastBar.high, px), symbol),
      low: roundPriceForSymbol(Math.min(lastBar.low, px), symbol),
      close: px,
    },
    lastBar.close,
  );
}

/** Apply an API bar into a series: update same time or append if newer. */
export function upsertBar(bars: OhlcBar[], bar: OhlcBar): OhlcBar[] {
  if (bars.length === 0) return [bar];
  const last = bars[bars.length - 1];
  if (bar.time === last.time) {
    const next = [...bars];
    next[next.length - 1] = bar;
    return next;
  }
  if (bar.time > last.time) {
    return [...bars, bar];
  }
  return bars;
}

/** Merge recent server bars into local series without wiping live forming candle. */
export function mergeRecentBars(local: OhlcBar[], remote: OhlcBar[]): OhlcBar[] {
  if (remote.length === 0) return local;
  if (local.length === 0) return remote;
  let out = [...local];
  for (const bar of remote) {
    out = upsertBar(out, bar);
  }
  return out;
}
