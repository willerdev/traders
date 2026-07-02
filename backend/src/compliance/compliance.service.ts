import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hasActiveTradingAccess } from '../common/weekly-access.util';

@Injectable()
export class ComplianceService {
  constructor(private prisma: PrismaService) {}

  /** Paid traders with valid weekly access can submit setups and use MT5. */
  async requireActiveTrader(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new ForbiddenException('Account is suspended');
    }

    if (!hasActiveTradingAccess(user)) {
      throw new ForbiddenException(
        user.registrationPaid
          ? 'Weekly access expired — pay to renew for 7 more trading days'
          : 'Complete weekly payment to access trading',
      );
    }

    return user;
  }

  async requireKycForPayout(userId: string) {
    await this.requireActiveTrader(userId);

    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });

    if (config?.requireKycForPayouts === false) {
      return;
    }

    const kyc = await this.prisma.kycVerification.findUnique({
      where: { userId },
    });

    if (!kyc || kyc.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Identity verification (KYC) must be approved before requesting payouts. Complete KYC in Settings.',
      );
    }
  }
}
