/**
 * Client-side chart setup normalization (mirrors backend/src/ai/chart-setup.util.ts).
 */

export type SetupFields = {
  direction: "BUY" | "SELL";
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
};

function isBuyValid(eMin: number, eMax: number, sl: number, tp: number) {
  return sl < eMin && tp > eMax;
}

function isSellValid(eMin: number, eMax: number, sl: number, tp: number) {
  return sl > eMax && tp < eMin;
}

export function normalizeSetupFields(input: SetupFields): SetupFields {
  let { entryMin, entryMax, stopLoss, takeProfit, direction } = input;

  if (entryMin > entryMax) {
    [entryMin, entryMax] = [entryMax, entryMin];
  }

  if (
    (direction === "BUY" &&
      isBuyValid(entryMin, entryMax, stopLoss, takeProfit)) ||
    (direction === "SELL" &&
      isSellValid(entryMin, entryMax, stopLoss, takeProfit))
  ) {
    return { direction, entryMin, entryMax, stopLoss, takeProfit };
  }

  const sorted = [entryMin, entryMax, stopLoss, takeProfit].sort((a, b) => a - b);
  const [a, b, c, d] = sorted;

  if (a < b && b <= c && c < d) {
    return {
      direction: "BUY",
      stopLoss: a,
      entryMin: b,
      entryMax: c,
      takeProfit: d,
    };
  }

  const unique = [...new Set(sorted)];
  if (unique.length === 3) {
    const [sl, entry, tp] = unique;
    const pad = Math.max(Math.abs(entry) * 0.00002, 0.01);
    if (sl < entry && entry < tp) {
      return {
        direction: "BUY",
        stopLoss: sl,
        entryMin: entry - pad,
        entryMax: entry + pad,
        takeProfit: tp,
      };
    }
    if (tp < entry && entry < sl) {
      return {
        direction: "SELL",
        takeProfit: tp,
        entryMin: entry - pad,
        entryMax: entry + pad,
        stopLoss: sl,
      };
    }
  }

  if (direction === "BUY" && isSellValid(entryMin, entryMax, stopLoss, takeProfit)) {
    direction = "SELL";
  } else if (
    direction === "SELL" &&
    isBuyValid(entryMin, entryMax, stopLoss, takeProfit)
  ) {
    direction = "BUY";
  }

  return { direction, entryMin, entryMax, stopLoss, takeProfit };
}

export function setupValidationError(setup: SetupFields): string | null {
  if (setup.entryMin >= setup.entryMax) {
    return "Enter a valid entry range (min must be less than max)";
  }
  if (setup.direction === "BUY" && !isBuyValid(
    setup.entryMin,
    setup.entryMax,
    setup.stopLoss,
    setup.takeProfit,
  )) {
    return "For BUY signals, stop loss must be below the entry range";
  }
  if (setup.direction === "SELL" && !isSellValid(
    setup.entryMin,
    setup.entryMax,
    setup.stopLoss,
    setup.takeProfit,
  )) {
    return "For SELL signals, stop loss must be above the entry range";
  }
  return null;
}
