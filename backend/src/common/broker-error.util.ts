/**
 * Converts raw MetaAPI / MT5 broker error messages into short,
 * human-friendly messages safe to show to traders.
 */

export type BrokerErrorKind =
  | 'rate_limit'
  | 'position_limit'
  | 'market_closed'
  | 'no_money'
  | 'invalid_stops'
  | 'invalid_price'
  | 'trade_disabled'
  | 'connection'
  | 'unknown';

const PATTERNS: Array<{ kind: BrokerErrorKind; test: RegExp }> = [
  {
    kind: 'rate_limit',
    test: /cpu credits|ratelimiting|rate limit|extend your quota|too many requests|429/i,
  },
  {
    kind: 'position_limit',
    test: /number of open positions|limit_positions|limit_orders|limited by the server settings|only position closing is allowed/i,
  },
  {
    kind: 'market_closed',
    test: /market_closed|market is closed|off quotes|no_quotes|session is closed/i,
  },
  {
    kind: 'no_money',
    test: /no_money|not enough money|insufficient (funds|margin)|no free margin/i,
  },
  {
    kind: 'invalid_stops',
    test: /invalid_stops|invalid s\/l|invalid stop|stops? level/i,
  },
  {
    kind: 'invalid_price',
    test: /invalid_price|invalid price|price changed|requote/i,
  },
  {
    kind: 'trade_disabled',
    test: /trade_disabled|trading is disabled|trade is disabled|market disabled/i,
  },
  {
    kind: 'connection',
    test: /etimedout|econnrefused|econnreset|fetch failed|socket hang up|terminal.*not (connected|synchronized)|not synchronized|gateway timeout|50[234]/i,
  },
];

const FRIENDLY: Record<Exclude<BrokerErrorKind, 'unknown'>, string> = {
  rate_limit:
    'Our trading server is briefly at full capacity. Your setup is saved — please wait a few minutes and try again. Nothing was lost.',
  position_limit:
    'The trading account has reached its maximum number of open positions allowed by the broker. Your setup is saved — try again once a position closes.',
  market_closed:
    'The market for this symbol is closed right now. Try again during trading hours — your setup stays saved.',
  no_money:
    'The trading account does not have enough free margin for this order right now. Our team has been notified — please try again later.',
  invalid_stops:
    'The broker rejected your stop loss / take profit levels — they may be too close to the current price. Adjust them slightly and try again.',
  invalid_price:
    'The price moved while placing your order. Please review your entry and try again.',
  trade_disabled:
    'Trading is temporarily disabled for this symbol on the broker side. Please try again later.',
  connection:
    'We could not reach the trading server. Your setup is saved — please try again in a few minutes.',
};

export function classifyBrokerError(raw: string | null | undefined): BrokerErrorKind {
  if (!raw) return 'unknown';
  for (const { kind, test } of PATTERNS) {
    if (test.test(raw)) return kind;
  }
  return 'unknown';
}

/** True for errors caused by platform-level limits that admins should know about. */
export function isPlatformLimitError(kind: BrokerErrorKind): boolean {
  return kind === 'rate_limit' || kind === 'position_limit' || kind === 'no_money';
}

export function humanizeBrokerError(
  raw: string | null | undefined,
  fallback = 'The trading server returned an unexpected response. Please try again in a few minutes.',
): string {
  const kind = classifyBrokerError(raw);
  if (kind !== 'unknown') return FRIENDLY[kind];
  if (!raw?.trim()) return fallback;

  // Hide technical payloads (URLs, account ids, long API dumps) from traders.
  const looksTechnical =
    /https?:\/\/|\/users\/current\/|accounts\/[0-9a-f-]{8,}|api allows|stack trace/i.test(raw) ||
    raw.length > 220;
  return looksTechnical ? fallback : raw.trim();
}
