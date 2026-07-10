export function canAccessMt5Copy(input?: {
  role?: string | null;
  adminPermissions?: { copy?: boolean } | null;
} | null): boolean {
  if (!input) return false;
  if (input.role === "ADMIN") return true;
  return Boolean(input.adminPermissions?.copy);
}

export function mt5NavHref(): string {
  return "/mt5";
}
