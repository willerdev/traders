export type AdminPermissionsView = {
  fullAdmin?: boolean;
  hubAccess?: boolean;
  kyc?: boolean;
  payout?: boolean;
  tpClaim?: boolean;
  setup?: boolean;
  copy?: boolean;
  managePermissions?: boolean;
};

export function canAccessMt5Copy(input?: {
  role?: string | null;
  adminPermissions?: AdminPermissionsView | null;
} | null): boolean {
  if (!input) return false;
  if (input.role === "ADMIN") return true;
  return Boolean(input.adminPermissions?.copy);
}

export function shouldRedirectMt5ToCopy(input?: {
  role?: string | null;
  adminPermissions?: AdminPermissionsView | null;
} | null): boolean {
  if (!input?.adminPermissions?.copy) return false;
  return input.role !== "ADMIN";
}

export function mt5NavHref(
  _input?: {
    role?: string | null;
    adminPermissions?: AdminPermissionsView | null;
  } | null,
): string {
  return "/mt5";
}
