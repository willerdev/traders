import { ChartAnalysisResult } from './vision.service';
import { normalizeDerivSymbol } from './deriv-symbols';

export function parseChartPrice(value: unknown): number {
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Map chart / TradingView / Deriv display names to MT5 broker symbols.
 * Delegates to deriv-symbols.ts for the full Deriv synthetic catalog.
 */
export function normalizeChartSymbol(raw: string): string {
  return normalizeDerivSymbol(raw);
}

function isBuyValid(
  entryMin: number,
  entryMax: number,
  stopLoss: number,
  takeProfit: number,
): boolean {
  return stopLoss < entryMin && takeProfit > entryMax;
}

function isSellValid(
  entryMin: number,
  entryMax: number,
  stopLoss: number,
  takeProfit: number,
): boolean {
  return stopLoss > entryMax && takeProfit < entryMin;
}

/**
 * Fix common vision-model mistakes: swapped SL/TP/entry, wrong direction vs geometry.
 */
export function normalizeChartSetup(
  input: ChartAnalysisResult,
): ChartAnalysisResult {
  let entryMin = input.entryMin;
  let entryMax = input.entryMax;
  let stopLoss = input.stopLoss;
  let takeProfit = input.takeProfit;
  let direction = input.direction;

  if (entryMin > entryMax) {
    [entryMin, entryMax] = [entryMax, entryMin];
  }

  const buyOk = isBuyValid(entryMin, entryMax, stopLoss, takeProfit);
  const sellOk = isSellValid(entryMin, entryMax, stopLoss, takeProfit);

  if (direction === 'BUY' && buyOk) {
    return { ...input, entryMin, entryMax, stopLoss, takeProfit, direction };
  }
  if (direction === 'SELL' && sellOk) {
    return { ...input, entryMin, entryMax, stopLoss, takeProfit, direction };
  }

  if (!buyOk && !sellOk) {
    const sorted = [entryMin, entryMax, stopLoss, takeProfit].sort(
      (a, b) => a - b,
    );
    const [a, b, c, d] = sorted;

    if (a < b && b <= c && c < d) {
      return {
        ...input,
        direction: 'BUY',
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
          ...input,
          direction: 'BUY',
          stopLoss: sl,
          entryMin: entry - pad,
          entryMax: entry + pad,
          takeProfit: tp,
        };
      }
      if (tp < entry && entry < sl) {
        return {
          ...input,
          direction: 'SELL',
          takeProfit: tp,
          entryMin: entry - pad,
          entryMax: entry + pad,
          stopLoss: sl,
        };
      }
    }
  }

  if (direction === 'BUY' && sellOk && !buyOk) {
    direction = 'SELL';
  } else if (direction === 'SELL' && buyOk && !sellOk) {
    direction = 'BUY';
  }

  return {
    ...input,
    direction,
    entryMin,
    entryMax,
    stopLoss,
    takeProfit,
  };
}

export function validateChartSetup(setup: ChartAnalysisResult): string | null {
  if (setup.entryMin >= setup.entryMax) {
    return 'Entry min must be less than entry max';
  }
  if (setup.direction === 'BUY' && !isBuyValid(
    setup.entryMin,
    setup.entryMax,
    setup.stopLoss,
    setup.takeProfit,
  )) {
    return 'For BUY signals, stop loss must be below the entry range and take profit above it';
  }
  if (setup.direction === 'SELL' && !isSellValid(
    setup.entryMin,
    setup.entryMax,
    setup.stopLoss,
    setup.takeProfit,
  )) {
    return 'For SELL signals, stop loss must be above the entry range and take profit below it';
  }
  return null;
}
