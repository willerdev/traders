import { User, UserRole } from '@prisma/client';

export type AdminPermission = 'full' | 'hub' | 'kyc' | 'payout' | 'tp_claim';

export type AdminPermissionsView = {
  fullAdmin: boolean;
  hubAccess: boolean;
  kyc: boolean;
  payout: boolean;
  tpClaim: boolean;
  managePermissions: boolean;
};

export type AdminUserFlags = Pick<
  User,
  | 'role'
  | 'adminCanApproveKyc'
  | 'adminCanApprovePayouts'
  | 'adminCanApproveTpClaims'
>;

export function hasAdminHubAccess(user: AdminUserFlags): boolean {
  return (
    user.role === UserRole.ADMIN ||
    user.adminCanApproveKyc ||
    user.adminCanApprovePayouts ||
    user.adminCanApproveTpClaims
  );
}

export function resolveAdminPermissions(
  user: AdminUserFlags,
): AdminPermissionsView {
  const fullAdmin = user.role === UserRole.ADMIN;
  return {
    fullAdmin,
    hubAccess: hasAdminHubAccess(user),
    kyc: fullAdmin || user.adminCanApproveKyc,
    payout: fullAdmin || user.adminCanApprovePayouts,
    tpClaim: fullAdmin || user.adminCanApproveTpClaims,
    managePermissions: fullAdmin,
  };
}

export function userHasAdminPermission(
  user: AdminUserFlags,
  permission: AdminPermission,
): boolean {
  if (permission === 'hub') {
    return hasAdminHubAccess(user);
  }
  if (user.role === UserRole.ADMIN) {
    return true;
  }
  if (permission === 'full') {
    return false;
  }
  if (permission === 'kyc') {
    return user.adminCanApproveKyc;
  }
  if (permission === 'payout') {
    return user.adminCanApprovePayouts;
  }
  if (permission === 'tp_claim') {
    return user.adminCanApproveTpClaims;
  }
  return false;
}

export function userHasAnyAdminPermission(
  user: AdminUserFlags,
  permissions: AdminPermission[],
): boolean {
  return permissions.some((permission) =>
    userHasAdminPermission(user, permission),
  );
}
