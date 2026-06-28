import { TradeDirection } from '@prisma/client';

export function computeEntryMid(entryMin: number, entryMax: number): number {
  return (entryMin + entryMax) / 2;
}

/** Price where reward equals initial risk (1:1 RR from mid entry). */
export function computeOneToOnePrice(
  direction: TradeDirection | 'BUY' | 'SELL',
  entryMin: number,
  entryMax: number,
  stopLoss: number,
): number {
  const mid = computeEntryMid(entryMin, entryMax);
  const risk = Math.abs(mid - stopLoss);
  return direction === 'BUY' ? mid + risk : mid - risk;
}

/** True when the setup's stated TP is at or beyond the 1:1 level (RR ≥ 1). */
export function isOneToOneClaimValidForSetup(
  direction: TradeDirection | 'BUY' | 'SELL',
  oneToOnePrice: number,
  takeProfit: number,
): boolean {
  const eps = 1e-9;
  if (direction === 'BUY') return oneToOnePrice <= takeProfit + eps;
  return oneToOnePrice >= takeProfit - eps;
}

export function priceReachedOneToOne(
  direction: TradeDirection | 'BUY' | 'SELL',
  oneToOnePrice: number,
  price: number,
): boolean {
  return direction === 'BUY'
    ? price >= oneToOnePrice
    : price <= oneToOnePrice;
}
