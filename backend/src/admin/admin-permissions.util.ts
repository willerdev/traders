import { User, UserRole } from '@prisma/client';

export type AdminPermission =
  | 'full'
  | 'hub'
  | 'kyc'
  | 'payout'
  | 'tp_claim'
  | 'setup';

export type AdminPermissionsView = {
  fullAdmin: boolean;
  hubAccess: boolean;
  kyc: boolean;
  payout: boolean;
  tpClaim: boolean;
  setup: boolean;
  managePermissions: boolean;
};

export type AdminUserFlags = Pick<
  User,
  | 'role'
  | 'adminCanApproveKyc'
  | 'adminCanApprovePayouts'
  | 'adminCanApproveTpClaims'
  | 'adminCanManageSetups'
>;

export function hasAdminHubAccess(user: AdminUserFlags): boolean {
  return (
    user.role === UserRole.ADMIN ||
    user.adminCanApproveKyc ||
    user.adminCanApprovePayouts ||
    user.adminCanApproveTpClaims ||
    user.adminCanManageSetups
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
    setup: fullAdmin || user.adminCanManageSetups,
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
  if (permission === 'setup') {
    return user.adminCanManageSetups;
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
