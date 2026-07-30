/** Unitrust product constants — parallel to Smart Invest with fixed 5% daily and monthly redeem. */
export const UNITRUST_DAILY_YIELD_PERCENT_DEFAULT = 5;
export const UNITRUST_MIN_DEPOSIT_DEFAULT = 100;
export const UNITRUST_MAX_DEPOSIT = 50_000;
/** New capital must age 24h before earning yield (same anti-gaming as Smart Invest). */
export const UNITRUST_YIELD_MIN_DEPOSIT_AGE_MS = 24 * 60 * 60 * 1000;
