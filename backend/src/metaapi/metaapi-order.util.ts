import { TradeDirection } from '@prisma/client';

export type MetaApiMarketAction = 'ORDER_TYPE_BUY' | 'ORDER_TYPE_SELL';

export type MetaApiPendingAction =
  | 'ORDER_TYPE_BUY_LIMIT'
  | 'ORDER_TYPE_SELL_LIMIT'
  | 'ORDER_TYPE_BUY_STOP'
  | 'ORDER_TYPE_SELL_STOP';

export type MetaApiOrderAction = MetaApiMarketAction | MetaApiPendingAction;

/** MT5 order comment — max 31 chars, ASCII-safe sender name. */
export function buildTradeOrderComment(
  displayName: string,
  userId: string,
): string {
  const normalized = displayName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const name =
    normalized.length >= 1 ? normalized : `trader_${userId.slice(0, 8)}`;
  return name.slice(0, 31);
}

export function roundToSymbolDigits(value: number, digits: number): number {
  if (!Number.isFinite(digits) || digits < 0) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Pick limit vs stop from entry price relative to current market.
 * BUY LIMIT / SELL LIMIT when open price is on the "pullback" side;
 * BUY STOP / SELL STOP when open price is on the "breakout" side.
 */
export function resolvePendingOrderType(
  direction: TradeDirection,
  openPrice: number,
  marketPrice: number,
): MetaApiPendingAction {
  if (direction === 'BUY') {
    return openPrice < marketPrice
      ? 'ORDER_TYPE_BUY_LIMIT'
      : 'ORDER_TYPE_BUY_STOP';
  }
  return openPrice > marketPrice
    ? 'ORDER_TYPE_SELL_LIMIT'
    : 'ORDER_TYPE_SELL_STOP';
}

/** Entry edge within the submitted zone for a pending order. */
export function resolvePendingOpenPrice(
  direction: TradeDirection,
  entryMin: number,
  entryMax: number,
  marketPrice: number,
): number {
  if (direction === 'BUY') {
    if (marketPrice >= entryMin) return entryMax;
    return entryMin;
  }
  if (marketPrice <= entryMax) return entryMin;
  return entryMax;
}

export function isPendingOrderAction(
  action: MetaApiOrderAction,
): action is MetaApiPendingAction {
  return action !== 'ORDER_TYPE_BUY' && action !== 'ORDER_TYPE_SELL';
}
