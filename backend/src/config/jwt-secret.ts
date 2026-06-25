import { Logger } from '@nestjs/common';

const logger = new Logger('JwtSecret');

export function resolveJwtSecret(raw?: string): string {
  const secret = raw?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProd) {
      throw new Error('JWT_SECRET must be set in production');
    }
    logger.warn('JWT_SECRET not set — using dev fallback (local only)');
    return 'dev-secret-change-me';
  }

  if (isProd && secret === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET cannot use the dev default in production');
  }

  return secret;
}
