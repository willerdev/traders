/** Emma’s Solo book: wallet = (deposits + profits) − $200 trading capital − MetaAPI capital. */

export const DEFAULT_SOLO_ALLOCATED_EMAIL = 'etuyizere64@gmail.com';
export const DEFAULT_SOLO_ALLOCATED_DEPOSIT_USDT = 500;
export const DEFAULT_SOLO_TRADING_CAPITAL_USDT = 200;

const DEPOSIT_TX_TYPES = new Set(['DEPOSIT', 'DEPOSITOR_DEPOSIT']);
const PROFIT_TX_TYPES = new Set([
  'TP_REWARD',
  'DEPOSITOR_EARNING',
  'INVESTOR_EARNING',
  'PROFIT_SHARE',
]);
const WITHDRAW_TX_TYPES = new Set(['DEPOSITOR_WITHDRAW', 'PAYOUT']);

export function allocatedTraderEmail(): string {
  return (
    process.env.SOLO_ALLOCATED_TRADER_EMAIL ?? DEFAULT_SOLO_ALLOCATED_EMAIL
  )
    .trim()
    .toLowerCase();
}

export function allocatedDepositUsdt(): number {
  const n = Number(
    process.env.SOLO_ALLOCATED_DEPOSIT_USDT ??
      DEFAULT_SOLO_ALLOCATED_DEPOSIT_USDT,
  );
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SOLO_ALLOCATED_DEPOSIT_USDT;
}

export function tradingCapitalLockUsdt(): number {
  const n = Number(
    process.env.SOLO_TRADING_CAPITAL_USDT ?? DEFAULT_SOLO_TRADING_CAPITAL_USDT,
  );
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SOLO_TRADING_CAPITAL_USDT;
}

export function isSoloAllocatedTraderEmail(email?: string | null): boolean {
  if (!email?.trim()) return false;
  return email.trim().toLowerCase() === allocatedTraderEmail();
}

export function roundAllocatedUsdt(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Live book looks like the shared admin account, not Emma’s $200 trading capital. */
export function isSharedLiveBook(
  liveEquity: number,
  tradingCapital: number,
): boolean {
  return liveEquity > tradingCapital * 2.5;
}

export function sumLedgerDepositsAndProfits(
  txs: Array<{ amount: unknown; type: string }>,
): { deposits: number; profits: number; withdrawn: number } {
  let deposits = 0;
  let profits = 0;
  let withdrawn = 0;
  for (const tx of txs) {
    const amount = Number(tx.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    if (DEPOSIT_TX_TYPES.has(tx.type) && amount > 0) deposits += amount;
    if (PROFIT_TX_TYPES.has(tx.type) && amount > 0) profits += amount;
    if (WITHDRAW_TX_TYPES.has(tx.type) && amount < 0) withdrawn += Math.abs(amount);
  }
  return {
    deposits: roundAllocatedUsdt(deposits),
    profits: roundAllocatedUsdt(profits),
    withdrawn: roundAllocatedUsdt(withdrawn),
  };
}

export function computeAllocatedWallet(input: {
  deposits: number;
  profits: number;
  withdrawn?: number;
  tradingCapitalLock: number;
  metaApiCapital: number;
}): number {
  const withdrawn = input.withdrawn ?? 0;
  return roundAllocatedUsdt(
    Math.max(
      0,
      input.deposits +
        input.profits -
        withdrawn -
        input.tradingCapitalLock -
        input.metaApiCapital,
    ),
  );
}
