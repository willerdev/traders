const DEMO_EMAIL_SUFFIX = '@traderrank.pro';

export function isDemoLeaderboardUser(email?: string | null): boolean {
  if (!email?.trim()) return false;
  return email.trim().toLowerCase().endsWith(DEMO_EMAIL_SUFFIX);
}

export function maskDisplayNameForPublic(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length <= 2) return trimmed;
  if (trimmed.length <= 4) {
    return `${trimmed.slice(0, 1)}${'*'.repeat(trimmed.length - 1)}`;
  }
  return `${trimmed.slice(0, 2)}${'*'.repeat(Math.min(trimmed.length - 2, 4))}${trimmed.slice(-1)}`;
}
