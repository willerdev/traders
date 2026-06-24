import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ComplianceService {
  constructor(private prisma: PrismaService) {}

  /** Paid, non-suspended traders can submit setups — KYC not required. */
  async requireActiveTrader(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new ForbiddenException('Account is suspended');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Complete registration payment to access this feature',
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
