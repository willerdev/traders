import { ChartAnalysisResult } from './vision.service';

export function parseChartPrice(value: unknown): number {
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Map chart / TradingView / shorthand names to MT5 broker symbols.
 * Volatility 75 (1s) and aliases resolve to Deriv MT5 ticker 1HZ75V (not VIX75).
 */
export function normalizeChartSymbol(raw: string): string {
  const symbol = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  const map: Record<string, string> = {
    '1HZ10V': '1HZ10V',
    '1HZ25V': '1HZ25V',
    '1HZ50V': '1HZ50V',
    '1HZ75V': '1HZ75V',
    '1HZ100V': '1HZ100V',
    HZ10V: '1HZ10V',
    HZ25V: '1HZ25V',
    HZ50V: '1HZ50V',
    HZ75V: '1HZ75V',
    HZ100V: '1HZ100V',
    VIX10: '1HZ10V',
    VIX10S: '1HZ10V',
    VIX101S: '1HZ10V',
    VOLATILITY10: '1HZ10V',
    VOLATILITY101S: '1HZ10V',
    VOL10: '1HZ10V',
    VIX25: '1HZ25V',
    VIX25S: '1HZ25V',
    VIX251S: '1HZ25V',
    VOLATILITY25: '1HZ25V',
    VOLATILITY251S: '1HZ25V',
    VOL25: '1HZ25V',
    VIX50: '1HZ50V',
    VIX50S: '1HZ50V',
    VIX501S: '1HZ50V',
    VOLATILITY50: '1HZ50V',
    VOL50: '1HZ50V',
    VIX75: '1HZ75V',
    VIX75S: '1HZ75V',
    VIX751S: '1HZ75V',
    VIX75INDEX: '1HZ75V',
    VOLATILITY75: '1HZ75V',
    VOLATILITY751S: '1HZ75V',
    VOLATILITY75INDEX: '1HZ75V',
    VOLATILITY751SINDEX: '1HZ75V',
    VOL75: '1HZ75V',
    V75: '1HZ75V',
    VIX100: '1HZ100V',
    VIX100S: '1HZ100V',
    VIX1001S: '1HZ100V',
    VOLATILITY100: '1HZ100V',
    VOL100: '1HZ100V',
    GOLD: 'XAUUSD',
    NASDAQ: 'NAS100',
  };

  if (map[symbol]) return map[symbol];
  if (/VOLATILITY10.*1S|VIX10.*1S|HZ10V/.test(symbol)) return '1HZ10V';
  if (/VOLATILITY25.*1S|VIX25.*1S|HZ25V/.test(symbol)) return '1HZ25V';
  if (/VOLATILITY50.*1S|VIX50.*1S|HZ50V/.test(symbol)) return '1HZ50V';
  if (/VOLATILITY75.*1S|VIX75.*1S|VIX751S|HZ75V/.test(symbol)) return '1HZ75V';
  if (/VOLATILITY100.*1S|VIX100.*1S|HZ100V/.test(symbol)) return '1HZ100V';
  if (/VOLATILITY75|VIX75|VOL75|^V75$/.test(symbol)) return '1HZ75V';
  if (/VOLATILITY25|VIX25|VOL25/.test(symbol)) return '1HZ25V';
  if (/VOLATILITY10|VIX10|VOL10/.test(symbol)) return '1HZ10V';
  if (/VOLATILITY50|VIX50|VOL50/.test(symbol)) return '1HZ50V';
  if (/VOLATILITY100|VIX100|VOL100/.test(symbol)) return '1HZ100V';

  return symbol || raw.trim().toUpperCase();
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
