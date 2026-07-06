import { computeWeeklyAccessExpiry } from './weekly-access.util';

export const MT5_SYNC_PLACEHOLDER_SCREENSHOT = 'mt5-sync://auto';

export function hasActiveMt5Sync(user: {
  mt5SyncActive?: boolean;
  mt5SyncExpiresAt?: Date | string | null;
  mt5SyncEnabled?: boolean;
  metaApiAccountId?: string | null;
}): boolean {
  if (!user.mt5SyncActive || user.mt5SyncEnabled === false) return false;
  if (!user.metaApiAccountId?.trim()) return false;
  if (!user.mt5SyncExpiresAt) return false;
  const expires =
    user.mt5SyncExpiresAt instanceof Date
      ? user.mt5SyncExpiresAt
      : new Date(user.mt5SyncExpiresAt);
  return expires.getTime() > Date.now();
}

export function computeMt5SyncExpiry(
  from: Date,
  existingExpiresAt?: Date | string | null,
): Date {
  const existing =
    existingExpiresAt == null
      ? null
      : existingExpiresAt instanceof Date
        ? existingExpiresAt
        : new Date(existingExpiresAt);
  return computeWeeklyAccessExpiry(from, existing);
}

export function isPlatformOriginatedClientId(clientId?: string | null): boolean {
  if (!clientId?.trim()) return false;
  const id = clientId.trim().toUpperCase();
  return id.startsWith('TRP_') || id.startsWith('CPY_');
}

export function directionFromMetaApiType(type: string): 'BUY' | 'SELL' | null {
  const t = type.toLowerCase();
  if (t.includes('buy')) return 'BUY';
  if (t.includes('sell')) return 'SELL';
  return null;
}
