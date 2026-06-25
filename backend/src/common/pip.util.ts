export function getPipSize(symbol: string): number {
  const s = symbol.toUpperCase();

  if (s.includes('JPY')) return 0.01;
  if (s === 'XAUUSD' || s.startsWith('XAU')) return 0.1;
  if (/^1HZ\d+V$/.test(s)) return 1;
  if (/^(NAS100|US30|US500|SPX500|USTEC|DE40|UK100)/.test(s)) return 1;

  return 0.0001;
}

export function entryMidpointPipDistance(
  symbol: string,
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): number {
  const pipSize = getPipSize(symbol);
  const aMid = (aMin + aMax) / 2;
  const bMid = (bMin + bMax) / 2;
  return Math.abs(aMid - bMid) / pipSize;
}
