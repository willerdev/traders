import { labelForSymbol } from "@/components/charts/chart-symbol-catalog";
import type { RealtimeQuote } from "@/components/charts/chart-data.service";

const ALWAYS_OPEN_PREFIXES = [
  "1HZ",
  "BOOM",
  "CRASH",
  "R_",
  "JD",
  "BTC",
  "ETH",
];

/** Forex: closed Sat–Sun UTC (approximate retail hours). */
function isForexWeekendClosed(now = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 6) return true;
  if (day === 0) return true;
  if (day === 5 && hour >= 22) return true;
  if (day === 1 && hour < 1) return true;
  return false;
}

function isForexSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (s.length !== 6) return false;
  const majors = ["EUR", "GBP", "USD", "JPY", "CHF", "CAD", "AUD", "NZD"];
  return majors.some((a) => s.startsWith(a)) && majors.some((b) => s.endsWith(b));
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
): "open" | "closed" {
  const sym = symbol.toUpperCase();
  if (ALWAYS_OPEN_PREFIXES.some((p) => sym.includes(p))) return "open";

  if (liveQuote?.bid != null && liveQuote?.ask != null) {
    if (isForexSymbol(sym) && isForexWeekendClosed()) return "closed";
    return "open";
  }

  if (chartError?.toLowerCase().includes("market")) return "closed";
  if (isForexSymbol(sym) && isForexWeekendClosed()) return "closed";

  return chartError ? "closed" : "open";
}
