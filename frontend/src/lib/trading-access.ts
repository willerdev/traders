export function hasTradingAccess(user: {
  status: string;
  role?: string;
  accessExpiresAt?: string | null;
  tradingAccessActive?: boolean;
}): boolean {
  if (user.tradingAccessActive === true) return true;
  if (user.role === "ADMIN") return true;
  if (user.status !== "ACTIVE") return false;
  if (!user.accessExpiresAt) return false;
  return new Date(user.accessExpiresAt).getTime() > Date.now();
}

export function tradingDaysRemaining(
  accessExpiresAt?: string | null,
): number | null {
  if (!accessExpiresAt) return null;
  const ms = new Date(accessExpiresAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function formatAccessExpiry(accessExpiresAt?: string | null) {
  if (!accessExpiresAt) return null;
  const days = tradingDaysRemaining(accessExpiresAt);
  if (days === null) return null;
  if (days <= 0) return "Expired";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}
