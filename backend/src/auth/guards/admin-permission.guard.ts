import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_PERMISSION_KEY } from '../decorators/admin-permission.decorator';
import {
  AdminPermission,
  userHasAnyAdminPermission,
} from '../../admin/admin-permissions.util';

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminPermission[]>(
      ADMIN_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      throw new ForbiddenException('Admin permission required');
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (userHasAnyAdminPermission(user, required)) {
      return true;
    }

    throw new ForbiddenException('You do not have permission for this action');
  }
}
