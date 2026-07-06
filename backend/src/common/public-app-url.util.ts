const OFFICIAL_APP_URL = 'https://thetradeguard.com';

/** Canonical public site URL for referral links, emails, and marketing. */
export function resolvePublicAppUrl(env: {
  PUBLIC_APP_URL?: string;
  FRONTEND_URL?: string;
}): string {
  const explicit = env.PUBLIC_APP_URL?.split(',')[0]?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const frontend = env.FRONTEND_URL?.split(',')[0]?.trim();
  if (frontend) {
    try {
      const host = new URL(frontend).hostname;
      if (!/\.onrender\.com$/i.test(host)) {
        return frontend.replace(/\/$/, '');
      }
    } catch {
      // ignore invalid FRONTEND_URL
    }
  }

  return OFFICIAL_APP_URL;
}
