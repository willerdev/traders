import type { ChartTimeframe, OHLCBar } from "@/components/charts/chart-types";

const PREFIX = "trp-chart-bars";
const TTL_MS = 20 * 60 * 1000; // 20 minutes

type CacheEntry = {
  bars: OHLCBar[];
  source: "metaapi" | "quote-fallback";
  savedAt: string;
};

function key(symbol: string, timeframe: ChartTimeframe) {
  return `${symbol.trim().toUpperCase()}:${timeframe}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readChartBarCache(
  symbol: string,
  timeframe: ChartTimeframe,
): CacheEntry | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(`${PREFIX}:${key(symbol, timeframe)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(parsed?.bars) || parsed.bars.length === 0) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (Number.isNaN(age) || age > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeChartBarCache(
  symbol: string,
  timeframe: ChartTimeframe,
  bars: OHLCBar[],
  source: "metaapi" | "quote-fallback",
) {
  if (!canUseStorage() || bars.length === 0) return;
  try {
    const entry: CacheEntry = {
      bars,
      source,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(
      `${PREFIX}:${key(symbol, timeframe)}`,
      JSON.stringify(entry),
    );
  } catch {
    /* quota */
  }
}

export function prefetchChartBarCache(
  symbol: string,
  timeframe: ChartTimeframe,
  loader: () => Promise<{
    bars: OHLCBar[];
    source: "metaapi" | "quote-fallback";
  }>,
) {
  if (readChartBarCache(symbol, timeframe)) return;
  void loader().then((result) => {
    if (result.bars.length > 0) {
      writeChartBarCache(symbol, timeframe, result.bars, result.source);
    }
  });
}
