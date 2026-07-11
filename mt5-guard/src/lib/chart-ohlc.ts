/** Shared OHLC sanity checks — keep in sync with frontend chart-data.service.ts */

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

function maxPriceJumpRatio(symbol: string, anchored: boolean): number {
  if (anchored) {
    return isSyntheticSymbol(symbol) ? 0.08 : 0.04;
  }
  return isSyntheticSymbol(symbol) ? 0.45 : 0.35;
}

function defaultMidForSymbol(symbol: string): number {
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
  if (s.includes("XAU") || s.includes("GOLD")) return 2650;
  if (s.includes("BTC")) return 68000;
  if (s.includes("JPY")) return 155;
  return 1.08;
}

export function isPlausibleQuotePrice(
  symbol: string,
  price: number,
  anchor?: number | null,
): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  const anchored =
    anchor != null && Number.isFinite(anchor) && anchor > 0;
  const ref = anchored ? anchor : defaultMidForSymbol(symbol);
  const ratio = price / ref;
  const jump = maxPriceJumpRatio(symbol, anchored);
  const minRatio = anchored ? 1 - jump : 0.25;
  const maxRatio = anchored ? 1 + jump : 4;
  return ratio >= minRatio && ratio <= maxRatio;
}

type OhlcBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

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
    if (!Number.isFinite(value) || value <= 0) return fallback;
    if (isPlausibleQuotePrice(symbol, value, ref)) return value;
    return Math.min(Math.max(value, ref * (1 - jump)), ref * (1 + jump));
  };

  const open = clampField(bar.open, ref);
  const close = clampField(bar.close, ref);
  const bodyTop = Math.max(open, close);
  const bodyBot = Math.min(open, close);

  let high = clampField(bar.high, bodyTop);
  let low = clampField(bar.low, bodyBot);
  high = Math.max(high, bodyTop);
  low = Math.min(low, bodyBot);

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
