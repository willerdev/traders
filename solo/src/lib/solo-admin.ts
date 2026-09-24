const SOLO_TRADE_OPERATOR_EMAILS = new Set([
  "willeratmit12@gmail.com",
  "olivierrwandanfx@gmail.com",
  "ejoel4838@gmail.com",
  "kigalihyperzone@gmail.com",
]);

export function canManageSoloTrades(user?: {
  email?: string | null;
  role?: string | null;
  canManageTrades?: boolean;
  soloTradeOperator?: boolean;
  isSoloPlatformAdmin?: boolean;
} | null): boolean {
  if (!user) return false;
  if (user.isSoloPlatformAdmin === true) return true;
  if (user.soloTradeOperator === true) return true;
  const email = user.email?.trim().toLowerCase();
  return Boolean(email && SOLO_TRADE_OPERATOR_EMAILS.has(email));
}
