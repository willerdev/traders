import { labelForSymbol } from "@/components/charts/chart-symbol-catalog";
import type { RealtimeQuote } from "@/components/charts/chart-data.service";

const ALWAYS_OPEN_PREFIXES = ["1HZ", "BOOM", "CRASH", "R_", "JD"];

const FOREX_MAJORS = ["EUR", "GBP", "USD", "JPY", "CHF", "CAD", "AUD", "NZD"];

/** Preferred defaults — first *open* symbol wins (weekday XAU, weekend synth). */
export const DEFAULT_CHART_SYMBOL_PRIORITY = [
  "XAUUSD",
  "1HZ75V",
  "1HZ50V",
  "BTCUSD",
  "ETHUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
] as const;

/** Default when no preference — first always-open synthetic. */
export const DEFAULT_ALWAYS_OPEN_SYMBOL = "1HZ75V";

/** Forex / metals / indices: closed Sat–Sun UTC (approximate retail hours). */
export function isForexWeekendClosed(now = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 6) return true;
  if (day === 0) return true;
  if (day === 5 && hour >= 22) return true;
  if (day === 1 && hour < 1) return true;
  return false;
}

export function isAlwaysOpenSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (ALWAYS_OPEN_PREFIXES.some((p) => s.includes(p))) return true;
  if (s.startsWith("BTC") || s.startsWith("ETH")) return true;
  return false;
}

function isForexSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (s.length !== 6) return false;
  return (
    FOREX_MAJORS.some((a) => s.startsWith(a)) &&
    FOREX_MAJORS.some((b) => s.endsWith(b))
  );
}

function isMetalSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return s.startsWith("XAU") || s.startsWith("XAG");
}

function isIndexSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return (
    s.includes("NAS") ||
    s.includes("US30") ||
    s.includes("US500") ||
    s.includes("SPX") ||
    s.includes("USTEC") ||
    s.includes("US100")
  );
}

/** Retail symbols that close on the forex weekend break. */
export function isRetailWeekendClosedSymbol(
  symbol: string,
  now = new Date(),
): boolean {
  if (isAlwaysOpenSymbol(symbol)) return false;
  if (!isForexWeekendClosed(now)) return false;
  const s = symbol.toUpperCase();
  return isForexSymbol(s) || isMetalSymbol(s) || isIndexSymbol(s);
}

export function displayTitleForSymbol(symbol: string): string {
  const label = labelForSymbol(symbol);
  if (label === symbol) return symbol;
  return label.replace(/\s*\/\s*/g, " vs ");
}

export function resolveMarketStatus(
  symbol: string,
  liveQuote: RealtimeQuote | null,
  chartError?: string | null,
  now = new Date(),
): "open" | "closed" {
  const sym = symbol.toUpperCase();
  if (isAlwaysOpenSymbol(sym)) return "open";

  if (isRetailWeekendClosedSymbol(sym, now)) return "closed";

  if (liveQuote?.bid != null && liveQuote?.ask != null) {
    return "open";
  }

  if (chartError?.toLowerCase().includes("market")) return "closed";

  return chartError ? "closed" : "open";
}

/** Pick the first open symbol from preferences, then the default priority list. */
export function pickDefaultChartSymbol(
  preferred?: string | string[] | null,
  now = new Date(),
): string {
  const prefs = (
    Array.isArray(preferred) ? preferred : preferred ? [preferred] : []
  )
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim().toUpperCase());

  const pool = [
    ...new Set([...prefs, ...DEFAULT_CHART_SYMBOL_PRIORITY]),
  ] as string[];

  for (const sym of pool) {
    if (resolveMarketStatus(sym, null, null, now) === "open") return sym;
  }

  return (
    DEFAULT_CHART_SYMBOL_PRIORITY.find((s) => isAlwaysOpenSymbol(s)) ??
    DEFAULT_ALWAYS_OPEN_SYMBOL
  );
}
