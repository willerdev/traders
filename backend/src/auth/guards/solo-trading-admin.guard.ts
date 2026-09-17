import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { assertSoloCanManageTrades } from '../../common/solo-admin.util';

/** Solo: only ADMIN_EMAIL may mutate trades. No-op on traders-api. */
@Injectable()
export class SoloTradingAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{
      user?: { email?: string | null };
    }>();
    assertSoloCanManageTrades(user?.email);
    return true;
  }
}
