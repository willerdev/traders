import type { ConfigService } from '@nestjs/config';

/** Public HTTPS base URL for this API (IPN webhooks, upload URLs, etc.). */
export function resolvePublicApiBaseUrl(
  config: ConfigService,
): string {
  const explicit =
    config.get<string>('API_PUBLIC_URL')?.replace(/\/$/, '') ||
    process.env.API_PUBLIC_URL?.replace(/\/$/, '');
  if (explicit) return explicit;

  const render =
    config.get<string>('RENDER_EXTERNAL_URL')?.replace(/\/$/, '') ||
    process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, '');
  if (render) return render;

  const port = config.get<string>('PORT') || process.env.PORT || '4000';
  return `http://localhost:${port}`;
}

export function isPublicHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname !== 'localhost';
  } catch {
    return false;
  }
}
