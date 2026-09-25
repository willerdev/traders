import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { resolveJwtSecret } from '../config/jwt-secret';
import { canSoloManageTrades, soloAdminRole } from '../common/solo-admin.util';
import { resolveSoloMaxRiskPercent } from '../common/solo-trade-operator.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status === 'BANNED' || user.status === 'SUSPENDED') {
      return null;
    }

    const canManageTrades = canSoloManageTrades(user.email, {
      soloTradeOperator: user.soloTradeOperator,
    });
    return {
      id: user.id,
      email: user.email,
      role: soloAdminRole(user.email, user.role),
      displayName: user.displayName,
      status: user.status,
      adminCanApproveKyc: user.adminCanApproveKyc,
      adminCanApprovePayouts: user.adminCanApprovePayouts,
      adminCanApproveTpClaims: user.adminCanApproveTpClaims,
      adminCanManageSetups: user.adminCanManageSetups,
      adminCanManageCopy: user.adminCanManageCopy,
      soloTradeOperator: user.soloTradeOperator,
      soloMaxRiskPercent: resolveSoloMaxRiskPercent(user.soloMaxRiskPercent),
      canManageTrades,
      soloDailyLossLocked: Boolean(user.soloDailyLossLocked),
    };
  }
}
