export type SymbolPriceFormat = {
  precision: number;
  minMove: number;
};

function seedFromSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i += 1) {
    h = (h * 31 + symbol.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
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

/** Price scale settings so forex candles render with visible bodies (not a flat line). */
export function priceFormatForSymbol(symbol: string): SymbolPriceFormat {
  const s = symbol.toUpperCase();
  const ref = defaultMidForSymbol(symbol);

  if (s.includes("JPY") && !s.includes("XAU")) {
    return { precision: 3, minMove: 0.001 };
  }
  if (s.includes("BTC") || ref >= 10000) {
    return { precision: 2, minMove: 0.01 };
  }
  if (ref >= 100) {
    return { precision: 2, minMove: 0.01 };
  }
  if (ref >= 10) {
    return { precision: 3, minMove: 0.001 };
  }
  return { precision: 5, minMove: 0.00001 };
}

export function roundPriceForSymbol(value: number, symbol: string): number {
  const { precision } = priceFormatForSymbol(symbol);
  const m = 10 ** precision;
  return Math.round(value * m) / m;
}
