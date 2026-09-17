const BLOCKED_TOKENS = new Set([
  "admin",
  "administrator",
  "admins",
  "platform",
  "platforms",
  "moderator",
  "moderators",
  "mod",
  "support",
  "helpdesk",
  "staff",
  "official",
  "verified",
  "system",
  "root",
  "superuser",
  "owner",
  "traderrank",
  "tradeguard",
  "signalhub",
  "aare",
  "quantum",
]);

const BLOCKED_COMPACT_FRAGMENTS = [
  "admin",
  "platform",
  "traderrank",
  "tradeguard",
  "moderator",
  "helpdesk",
  "signalhub",
  "official",
  "verified",
];

export const DISPLAY_NAME_RESERVED_MESSAGE =
  "This display name is reserved. Choose a name that does not impersonate platform staff or official accounts.";

function normalizeDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function compactDisplayName(name: string): string {
  return normalizeDisplayName(name)
    .toLowerCase()
    .replace(/[\s_\-.]+/g, "");
}

function displayNameTokens(name: string): string[] {
  return normalizeDisplayName(name)
    .toLowerCase()
    .split(/[\s_\-.]+/)
    .filter(Boolean);
}

export function validateDisplayName(name: string): string | null {
  const trimmed = normalizeDisplayName(name);

  if (!trimmed) {
    return "Display name is required";
  }
  if (trimmed.length < 2) {
    return "Display name must be at least 2 characters";
  }
  if (trimmed.length > 40) {
    return "Display name must be at most 40 characters";
  }

  for (const token of displayNameTokens(trimmed)) {
    if (BLOCKED_TOKENS.has(token)) {
      return DISPLAY_NAME_RESERVED_MESSAGE;
    }
  }

  const compact = compactDisplayName(trimmed);
  for (const fragment of BLOCKED_COMPACT_FRAGMENTS) {
    if (compact.includes(fragment)) {
      return DISPLAY_NAME_RESERVED_MESSAGE;
    }
  }

  return null;
}

export function isDisplayNameAllowed(name: string): boolean {
  return validateDisplayName(name) === null;
}
