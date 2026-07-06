import { SetMetadata } from '@nestjs/common';
import { AdminPermission } from '../../admin/admin-permissions.util';

export const ADMIN_PERMISSION_KEY = 'adminPermission';

export const RequireAdminPermission = (...permissions: AdminPermission[]) =>
  SetMetadata(ADMIN_PERMISSION_KEY, permissions);
