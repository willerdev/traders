export const PLATFORM_EMAIL_ALLOWLIST = new Set([
  'admin@traderrank.pro',
  'agent@traderrank.pro',
]);

/** Seeded demo personas that must not appear on the public leaderboard. */
export const BLOCKED_DEMO_DISPLAY_NAMES = new Set([
  'goldrushfx',
  'pipmaster_ke',
  'xau_sniper',
  'volatilityqueen',
  'trendlinetom',
]);

const DEMO_LEADERBOARD_EMAIL_PATTERN =
  /^leaderboard\.demo\d+@traderrank\.pro$/i;

export type AbuseMatchReason =
  | 'demo_leaderboard_email'
  | 'internal_traderrank_email'
  | 'impersonated_demo_display_name';

export type AbuseAccountInput = {
  id: string;
  email: string | null;
  displayName: string;
  role: string;
  status: string;
};

export type AbuseAssessment = {
  abusive: boolean;
  reasons: AbuseMatchReason[];
};

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? '';
}

function normalizeDisplayName(displayName: string): string {
  return displayName.trim().toLowerCase();
}

export function isPlatformEmailAllowlisted(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && PLATFORM_EMAIL_ALLOWLIST.has(normalized);
}

export function isDemoLeaderboardEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return DEMO_LEADERBOARD_EMAIL_PATTERN.test(normalized);
}

export function isBlockedDemoDisplayName(displayName: string): boolean {
  return BLOCKED_DEMO_DISPLAY_NAMES.has(normalizeDisplayName(displayName));
}

export function assessAccountAbuse(user: AbuseAccountInput): AbuseAssessment {
  const reasons: AbuseMatchReason[] = [];

  if (user.role === 'ADMIN' || user.status === 'BANNED') {
    return { abusive: false, reasons };
  }

  const email = normalizeEmail(user.email);

  if (isDemoLeaderboardEmail(email)) {
    reasons.push('demo_leaderboard_email');
  }

  if (
    email.endsWith('@traderrank.pro') &&
    !isPlatformEmailAllowlisted(email)
  ) {
    reasons.push('internal_traderrank_email');
  }

  if (
    isBlockedDemoDisplayName(user.displayName) &&
    !isDemoLeaderboardEmail(email)
  ) {
    reasons.push('impersonated_demo_display_name');
  }

  return { abusive: reasons.length > 0, reasons };
}
