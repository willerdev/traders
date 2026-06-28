import { BadRequestException } from '@nestjs/common';

/** Whole-word tokens that cannot appear in a trader display name. */
const BLOCKED_TOKENS = new Set([
  'admin',
  'administrator',
  'admins',
  'platform',
  'platforms',
  'moderator',
  'moderators',
  'mod',
  'support',
  'helpdesk',
  'staff',
  'official',
  'verified',
  'system',
  'root',
  'superuser',
  'owner',
  'traderrank',
  'tradeguard',
  'signalhub',
  'aare',
  'quantum',
]);

/** Compact (no separators) substrings — catches PlatformAdmin, x_admin_y, etc. */
const BLOCKED_COMPACT_FRAGMENTS = [
  'admin',
  'platform',
  'traderrank',
  'tradeguard',
  'moderator',
  'helpdesk',
  'signalhub',
  'official',
  'verified',
];

export const DISPLAY_NAME_RESERVED_MESSAGE =
  'This display name is reserved. Choose a name that does not impersonate platform staff or official accounts.';

export function normalizeDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function compactDisplayName(name: string): string {
  return normalizeDisplayName(name)
    .toLowerCase()
    .replace(/[\s_\-.]+/g, '');
}

export function displayNameTokens(name: string): string[] {
  return normalizeDisplayName(name)
    .toLowerCase()
    .split(/[\s_\-.]+/)
    .filter(Boolean);
}

export function isDisplayNameAllowed(name: string): boolean {
  try {
    assertAllowedDisplayName(name);
    return true;
  } catch {
    return false;
  }
}

export function assertAllowedDisplayName(name: string): string {
  const trimmed = normalizeDisplayName(name);

  if (!trimmed) {
    throw new BadRequestException('Display name is required');
  }
  if (trimmed.length < 2) {
    throw new BadRequestException('Display name must be at least 2 characters');
  }
  if (trimmed.length > 40) {
    throw new BadRequestException('Display name must be at most 40 characters');
  }

  const tokens = displayNameTokens(trimmed);
  for (const token of tokens) {
    if (BLOCKED_TOKENS.has(token)) {
      throw new BadRequestException(DISPLAY_NAME_RESERVED_MESSAGE);
    }
  }

  const compact = compactDisplayName(trimmed);
  for (const fragment of BLOCKED_COMPACT_FRAGMENTS) {
    if (compact.includes(fragment)) {
      throw new BadRequestException(DISPLAY_NAME_RESERVED_MESSAGE);
    }
  }

  return trimmed;
}
