export type ChartSymbolEntry = {
  symbol: string;
  label: string;
  category: string;
  aliases?: string[];
};

/** Searchable MT5 / Deriv symbols users can add to the chart watchlist. */
export const CHART_SYMBOL_CATALOG: ChartSymbolEntry[] = [
  { symbol: "EURUSD", label: "EUR/USD", category: "Forex", aliases: ["EUR", "EURO"] },
  { symbol: "GBPUSD", label: "GBP/USD", category: "Forex", aliases: ["CABLE"] },
  { symbol: "USDJPY", label: "USD/JPY", category: "Forex" },
  { symbol: "USDCHF", label: "USD/CHF", category: "Forex" },
  { symbol: "USDCAD", label: "USD/CAD", category: "Forex" },
  { symbol: "AUDUSD", label: "AUD/USD", category: "Forex" },
  { symbol: "NZDUSD", label: "NZD/USD", category: "Forex" },
  { symbol: "EURGBP", label: "EUR/GBP", category: "Forex" },
  { symbol: "EURJPY", label: "EUR/JPY", category: "Forex" },
  { symbol: "GBPJPY", label: "GBP/JPY", category: "Forex" },
  { symbol: "XAUUSD", label: "Gold / USD", category: "Metals", aliases: ["GOLD"] },
  { symbol: "XAGUSD", label: "Silver / USD", category: "Metals", aliases: ["SILVER"] },
  { symbol: "BTCUSD", label: "Bitcoin / USD", category: "Crypto", aliases: ["BTC"] },
  { symbol: "ETHUSD", label: "Ethereum / USD", category: "Crypto", aliases: ["ETH"] },
  { symbol: "NAS100", label: "Nasdaq 100", category: "Indices", aliases: ["US100", "USTEC"] },
  { symbol: "US30", label: "Dow Jones 30", category: "Indices", aliases: ["DJ30"] },
  { symbol: "US500", label: "S&P 500", category: "Indices", aliases: ["SPX500"] },
  { symbol: "1HZ75V", label: "Volatility 75 (1s)", category: "Synthetic", aliases: ["V75", "VOL75"] },
  { symbol: "1HZ100V", label: "Volatility 100 (1s)", category: "Synthetic", aliases: ["V100"] },
  { symbol: "1HZ50V", label: "Volatility 50 (1s)", category: "Synthetic", aliases: ["V50"] },
  { symbol: "1HZ25V", label: "Volatility 25 (1s)", category: "Synthetic", aliases: ["V25"] },
  { symbol: "R_75", label: "Volatility 75 Index", category: "Synthetic" },
  { symbol: "R_100", label: "Volatility 100 Index", category: "Synthetic" },
  { symbol: "BOOM1000", label: "Boom 1000 Index", category: "Synthetic" },
  { symbol: "CRASH1000", label: "Crash 1000 Index", category: "Synthetic" },
  { symbol: "JD100", label: "Jump 100 Index", category: "Synthetic" },
];

const catalogByKey = new Map<string, ChartSymbolEntry>();

for (const entry of CHART_SYMBOL_CATALOG) {
  catalogByKey.set(normalizeSymbolKey(entry.symbol), entry);
  for (const alias of entry.aliases ?? []) {
    catalogByKey.set(normalizeSymbolKey(alias), entry);
  }
  catalogByKey.set(normalizeSymbolKey(entry.label), entry);
}

export function normalizeSymbolKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function resolveChartSymbol(raw: string): string {
  const key = normalizeSymbolKey(raw);
  return catalogByKey.get(key)?.symbol ?? key;
}

export function searchChartSymbols(query: string, limit = 12): ChartSymbolEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return CHART_SYMBOL_CATALOG.slice(0, limit);

  const scored: Array<{ entry: ChartSymbolEntry; score: number }> = [];

  for (const entry of CHART_SYMBOL_CATALOG) {
    const sym = entry.symbol.toUpperCase();
    const label = entry.label.toUpperCase();
    let score = 0;
    if (sym === q || label === q) score = 100;
    else if (sym.startsWith(q)) score = 80;
    else if (label.startsWith(q)) score = 70;
    else if (sym.includes(q) || label.includes(q)) score = 50;
    else if (entry.aliases?.some((a) => a.toUpperCase().includes(q))) score = 40;
    if (score > 0) scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entry.symbol.localeCompare(b.entry.symbol))
    .slice(0, limit)
    .map((s) => s.entry);
}

export function labelForSymbol(symbol: string): string {
  return catalogByKey.get(normalizeSymbolKey(symbol))?.label ?? symbol;
}
