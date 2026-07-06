import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PlatformNotificationsService } from '../platform-notifications/platform-notifications.service';

const DEFAULT_KYC_REWARD = 0.5;
const DEFAULT_PAID_REWARD = 1;

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private platformNotifications: PlatformNotificationsService,
  ) {}

  private async rewardAmounts() {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return {
      kycReward: Number(config?.referralKycRewardUsdt ?? DEFAULT_KYC_REWARD),
      paidReward: Number(config?.referralPaidRewardUsdt ?? DEFAULT_PAID_REWARD),
    };
  }

  async getOrCreateCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (user?.referralCode) return user.referralCode;

    // Retry on the (rare) unique-collision.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { referralCode: code },
        });
        return code;
      } catch {
        continue;
      }
    }
    throw new BadRequestException('Could not generate a referral code');
  }

  /** Links a newly registered user to their referrer. Silently ignores bad codes. */
  async attachReferral(newUserId: string, rawCode: string | undefined | null) {
    const code = rawCode?.trim().toUpperCase();
    if (!code) return;

    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!referrer || referrer.id === newUserId) return;

    await this.prisma.user.update({
      where: { id: newUserId },
      data: { referredById: referrer.id },
    });
    this.logger.log(`User ${newUserId} referred by ${referrer.id} (${code})`);
  }

  /** Called when a referred user's KYC is approved. Idempotent. */
  async rewardForKyc(referredUserId: string) {
    const { kycReward } = await this.rewardAmounts();
    await this.creditReferrer(
      referredUserId,
      'referralKycRewardedAt',
      kycReward,
      'completed KYC verification',
    );
  }

  /** Called when a referred user pays registration/subscription. Idempotent. */
  async rewardForPaidRegistration(referredUserId: string) {
    const { paidReward } = await this.rewardAmounts();
    await this.creditReferrer(
      referredUserId,
      'referralPaidRewardedAt',
      paidReward,
      'paid their subscription',
    );
  }

  private async creditReferrer(
    referredUserId: string,
    flagField: 'referralKycRewardedAt' | 'referralPaidRewardedAt',
    amount: number,
    milestone: string,
  ) {
    if (amount <= 0) return;

    const referred = await this.prisma.user.findUnique({
      where: { id: referredUserId },
      select: {
        id: true,
        displayName: true,
        referredById: true,
        referralKycRewardedAt: true,
        referralPaidRewardedAt: true,
      },
    });
    if (!referred?.referredById) return;
    if (referred[flagField]) return; // already rewarded

    const referrerId = referred.referredById;
    const account = await this.prisma.virtualAccount.findUnique({
      where: { userId: referrerId },
    });

    const newBalance = account ? Number(account.balance) + amount : null;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: referredUserId },
        data: { [flagField]: new Date() },
      }),
      ...(account
        ? [
            this.prisma.virtualAccount.update({
              where: { userId: referrerId },
              data: { balance: newBalance as number },
            }),
          ]
        : []),
      this.prisma.walletTransaction.create({
        data: {
          userId: referrerId,
          amount,
          type: 'REFERRAL_REWARD',
          referenceId: referredUserId,
          description: `$${amount} referral reward — ${referred.displayName} ${milestone}`,
          balanceAfter: newBalance,
        },
      }),
    ]);

    await this.platformNotifications
      .create({
        userId: referrerId,
        type: 'REFERRAL_REWARD',
        title: `You earned $${amount} — referral milestone`,
        body: `${referred.displayName} ${milestone}. $${amount} USDT was credited to your wallet.`,
        linkUrl: '/settings',
      })
      .catch(() => undefined);

    this.logger.log(
      `Referral reward: $${amount} to ${referrerId} (${referred.displayName} ${milestone})`,
    );
  }

  async getMyReferralInfo(userId: string) {
    const code = await this.getOrCreateCode(userId);
    const { kycReward, paidReward } = await this.rewardAmounts();

    const [referrals, earnings] = await Promise.all([
      this.prisma.user.findMany({
        where: { referredById: userId },
        select: {
          id: true,
          displayName: true,
          createdAt: true,
          registrationPaid: true,
          referralKycRewardedAt: true,
          referralPaidRewardedAt: true,
          kyc: { select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { userId, type: 'REFERRAL_REWARD' },
        _sum: { amount: true },
      }),
    ]);

    return {
      code,
      link: `${this.email.frontendUrl}/register?ref=${code}`,
      rewards: { kycRewardUsdt: kycReward, paidRewardUsdt: paidReward },
      totalEarnedUsdt: Number(earnings._sum.amount ?? 0),
      totalReferred: referrals.length,
      referrals: referrals.map((r) => ({
        displayName: r.displayName,
        joinedAt: r.createdAt.toISOString(),
        kycCompleted: r.kyc?.status === 'APPROVED',
        subscribed: r.registrationPaid,
        kycRewarded: Boolean(r.referralKycRewardedAt),
        paidRewarded: Boolean(r.referralPaidRewardedAt),
      })),
    };
  }

  // ── Admin ────────────────────────────────────────────────────────────

  async getAdminSettings() {
    const { kycReward, paidReward } = await this.rewardAmounts();
    const [totalLinks, totalPaid] = await Promise.all([
      this.prisma.user.count({ where: { referredById: { not: null } } }),
      this.prisma.walletTransaction.aggregate({
        where: { type: 'REFERRAL_REWARD' },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return {
      kycRewardUsdt: kycReward,
      paidRewardUsdt: paidReward,
      totalReferredUsers: totalLinks,
      totalRewardsPaidUsdt: Number(totalPaid._sum.amount ?? 0),
      totalRewardsCount: totalPaid._count,
    };
  }

  async updateAdminSettings(input: {
    kycRewardUsdt?: number;
    paidRewardUsdt?: number;
  }) {
    const data: Record<string, number> = {};
    if (input.kycRewardUsdt !== undefined) {
      if (input.kycRewardUsdt < 0 || input.kycRewardUsdt > 1000) {
        throw new BadRequestException('KYC reward must be between 0 and 1000');
      }
      data.referralKycRewardUsdt = input.kycRewardUsdt;
    }
    if (input.paidRewardUsdt !== undefined) {
      if (input.paidRewardUsdt < 0 || input.paidRewardUsdt > 1000) {
        throw new BadRequestException(
          'Subscription reward must be between 0 and 1000',
        );
      }
      data.referralPaidRewardUsdt = input.paidRewardUsdt;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });

    return this.getAdminSettings();
  }

  async listReferrersForAdmin(limit = 50) {
    const referrers = await this.prisma.user.findMany({
      where: { referrals: { some: {} } },
      select: {
        id: true,
        displayName: true,
        email: true,
        referralCode: true,
        referrals: {
          select: {
            displayName: true,
            createdAt: true,
            registrationPaid: true,
            referralKycRewardedAt: true,
            referralPaidRewardedAt: true,
            kyc: { select: { status: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        walletTransactions: {
          where: { type: 'REFERRAL_REWARD' },
          select: { amount: true },
        },
      },
      take: limit,
    });

    return referrers
      .map((r) => ({
        userId: r.id,
        displayName: r.displayName,
        email: r.email,
        referralCode: r.referralCode,
        totalReferred: r.referrals.length,
        kycCompleted: r.referrals.filter((x) => x.kyc?.status === 'APPROVED')
          .length,
        subscribed: r.referrals.filter((x) => x.registrationPaid).length,
        totalEarnedUsdt: r.walletTransactions.reduce(
          (sum, tx) => sum + Number(tx.amount),
          0,
        ),
        referrals: r.referrals.map((x) => ({
          displayName: x.displayName,
          joinedAt: x.createdAt.toISOString(),
          kycCompleted: x.kyc?.status === 'APPROVED',
          subscribed: x.registrationPaid,
        })),
      }))
      .sort((a, b) => b.totalReferred - a.totalReferred);
  }
}
