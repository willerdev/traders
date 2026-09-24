import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSoloCanManageTrades } from '../../common/solo-admin.util';
import { isSoloApp } from '../../common/app-variant';

@Injectable()
export class SoloTradingAdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{
      user?: {
        id?: string;
        email?: string | null;
        canManageTrades?: boolean;
        soloTradeOperator?: boolean;
      };
    }>();
    if (!isSoloApp()) return true;
    if (
      user?.canManageTrades === true ||
      user?.soloTradeOperator === true
    ) {
      assertSoloCanManageTrades(user?.email, {
        canManageTrades: user.canManageTrades,
        soloTradeOperator: user.soloTradeOperator,
      });
      return true;
    }
    let operator = false;
    if (user?.id) {
      const row = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { soloTradeOperator: true, email: true },
      });
      operator = Boolean(row?.soloTradeOperator);
    }
    assertSoloCanManageTrades(user?.email, {
      soloTradeOperator: operator,
    });
    return true;
  }
}
