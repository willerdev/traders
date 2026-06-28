import { TradeDirection } from '@prisma/client';

export type MetaApiMarketAction = 'ORDER_TYPE_BUY' | 'ORDER_TYPE_SELL';

export type MetaApiPendingAction =
  | 'ORDER_TYPE_BUY_LIMIT'
  | 'ORDER_TYPE_SELL_LIMIT'
  | 'ORDER_TYPE_BUY_STOP'
  | 'ORDER_TYPE_SELL_STOP';

export type MetaApiOrderAction = MetaApiMarketAction | MetaApiPendingAction;

/** MetaAPI: combined comment + clientId length must be <= 26. */
export const METAAPI_COMMENT_CLIENTID_BUDGET = 26;

/** MT5 order comment — ASCII-safe sender name (max 31 when no clientId). */
export function buildTradeOrderComment(
  displayName: string,
  userId: string,
  maxLen = 31,
): string {
  const normalized = displayName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const name =
    normalized.length >= 1 ? normalized : `trader_${userId.slice(0, 8)}`;
  const limit = Math.max(1, Math.min(maxLen, 31));
  return name.slice(0, limit);
}

/**
 * MetaAPI clientId must follow `${strategyId}_${positionId}_${orderId}` and fit
 * in the comment+clientId budget with the order comment.
 */
export function buildMetaApiTradeIdentifiers(input: {
  displayName: string;
  userId: string;
  signalId: string;
  symbol: string;
}): { comment: string; clientId: string } {
  const symToken =
    input.symbol
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 10) || 'X';
  const sigToken =
    input.signalId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'sig';
  const clientId = `TRP_${symToken}_${sigToken}`.slice(
    0,
    METAAPI_COMMENT_CLIENTID_BUDGET,
  );

  const commentBudget =
    METAAPI_COMMENT_CLIENTID_BUDGET - clientId.length;
  const comment = buildTradeOrderComment(
    input.displayName,
    input.userId,
    commentBudget,
  );

  return { comment, clientId };
}

/** Normalized MT5 comment prefix for a trader (used to match open positions). */
export function normalizeTraderCommentName(
  displayName: string,
  userId: string,
): string {
  return buildTradeOrderComment(displayName, userId, 31);
}

/** True when the MT5 order/position comment belongs to this trader. */
export function tradeCommentBelongsToUser(
  comment: string | undefined,
  displayName: string,
  userId: string,
): boolean {
  if (!comment?.trim()) return false;

  const expected = normalizeTraderCommentName(displayName, userId).toLowerCase();
  const actual = comment.trim().toLowerCase();

  if (!expected) return false;
  if (actual === expected) return true;
  if (actual.startsWith(expected) || expected.startsWith(actual)) return true;

  const alt = displayName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();
  if (alt.length >= 2 && (actual.includes(alt) || alt.includes(actual))) {
    return true;
  }

  const fallback = `trader_${userId.slice(0, 8)}`.toLowerCase();
  return actual.startsWith(fallback);
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

/** Signal Hub pending order type — limit (buy/sell limit) or stop (buy/sell stop). */
export function resolveHubPendingOrderType(
  direction: TradeDirection,
  openPrice: number,
  marketPrice: number,
): 'limit' | 'stop' {
  const pending = resolvePendingOrderType(direction, openPrice, marketPrice);
  return pending.includes('STOP') ? 'stop' : 'limit';
}
