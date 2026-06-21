import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateProfileDto,
  UpdateAddressDto,
  SubmitKycDto,
} from '../common/dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        virtualAccount: true,
        kyc: true,
        profile: true,
        _count: { select: { signals: true } },
      },
    });

    if (!user) return null;

    const now = new Date();
    const weekNumber = this.getWeekNumber(now);
    const year = now.getFullYear();

    const rank = await this.prisma.leaderboard.findUnique({
      where: { userId_year_weekNumber: { userId, year, weekNumber } },
    });

    const recentSignals = await this.prisma.signal.findMany({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
      take: 5,
    });

    const walletTransactions = await this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        registrationPaid: user.registrationPaid,
      },
      onboarding: {
        emailVerified: user.emailVerified,
        registrationPaid: user.registrationPaid,
        accountActive: user.status === 'ACTIVE',
        kycStatus: user.kyc?.status ?? 'NOT_STARTED',
        profileComplete: Boolean(
          user.profile?.firstName &&
            user.profile?.lastName &&
            user.profile?.country,
        ),
        addressComplete: Boolean(user.profile?.addressLine1),
        hasSubmittedSignal: user._count.signals > 0,
      },
      account: user.virtualAccount,
      rank: rank?.rank ?? null,
      tier: user.virtualAccount?.tier ?? 'BRONZE',
      recentSignals,
      walletTransactions,
    };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        status: true,
        createdAt: true,
        virtualAccount: true,
      },
    });
  }

  async getSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        kyc: true,
        virtualAccount: { select: { tier: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        walletAddress: user.walletAddress,
        createdAt: user.createdAt,
        tier: user.virtualAccount?.tier ?? 'BRONZE',
      },
      profile: user.profile,
      kyc: user.kyc ?? { status: 'NOT_STARTED' },
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const userUpdate: { displayName?: string } = {};
    if (dto.displayName?.trim()) {
      userUpdate.displayName = dto.displayName.trim();
    }

    if (Object.keys(userUpdate).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: userUpdate,
      });
    }

    const profileData = {
      firstName: dto.firstName?.trim() || undefined,
      lastName: dto.lastName?.trim() || undefined,
      phone: dto.phone?.trim() || undefined,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    };

    const hasProfileFields = Object.values(profileData).some((v) => v !== undefined);
    if (hasProfileFields) {
      await this.prisma.userProfile.upsert({
        where: { userId },
        create: { userId, ...profileData },
        update: profileData,
      });
    }

    return this.getSettings(userId);
  }

  async updateAddress(userId: string, dto: UpdateAddressDto) {
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        country: dto.country?.trim() || null,
        state: dto.state?.trim() || null,
        city: dto.city?.trim() || null,
        addressLine1: dto.addressLine1?.trim() || null,
        addressLine2: dto.addressLine2?.trim() || null,
        postalCode: dto.postalCode?.trim() || null,
      },
      update: {
        country: dto.country?.trim() || null,
        state: dto.state?.trim() || null,
        city: dto.city?.trim() || null,
        addressLine1: dto.addressLine1?.trim() || null,
        addressLine2: dto.addressLine2?.trim() || null,
        postalCode: dto.postalCode?.trim() || null,
      },
    });

    return this.getSettings(userId);
  }

  async submitKyc(userId: string, dto: SubmitKycDto) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (
      !profile?.firstName ||
      !profile?.lastName ||
      !profile?.country ||
      !profile?.addressLine1
    ) {
      throw new BadRequestException(
        'Complete your profile and address before submitting KYC',
      );
    }

    const existing = await this.prisma.kycVerification.findUnique({
      where: { userId },
    });

    if (existing?.status === 'PENDING') {
      throw new BadRequestException('KYC submission is already under review');
    }

    if (existing?.status === 'APPROVED') {
      throw new BadRequestException('KYC is already approved');
    }

    const data = {
      status: 'PENDING' as const,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber.trim(),
      documentFrontUrl: dto.documentFrontUrl,
      documentBackUrl: dto.documentBackUrl || null,
      selfieUrl: dto.selfieUrl,
      rejectionReason: null,
      submittedAt: new Date(),
      reviewedAt: null,
    };

    const kyc = await this.prisma.kycVerification.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return kyc;
  }

  async getKyc(userId: string) {
    const kyc = await this.prisma.kycVerification.findUnique({
      where: { userId },
    });

    return kyc ?? { status: 'NOT_STARTED' };
  }

  private getWeekNumber(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  }
}
