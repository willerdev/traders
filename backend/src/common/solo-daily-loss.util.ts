export const SOLO_DAILY_LOSS_LIMIT_USDT = 200;

export const SOLO_DAILY_LOSS_LOCKED =
  'Daily loss limit of $200 reached. New trades are locked until an admin resets your limit.';

const TRADING_DAY_TZ = 'Africa/Kigali';

export function soloTradingDayKey(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TRADING_DAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
