import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../email/notification.service';
import { PlatformNotificationsService } from '../platform-notifications/platform-notifications.service';

const DEFAULT_KYC_REWARD = 0.5;
const DEFAULT_PAID_REWARD = 1;

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private notifications: NotificationService,
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
    await this.creditAndNotifyOnInviteUsed(newUserId);
  }

  /**
   * When someone signs up with a referral code: credit the referrer wallet
   * immediately (subscription reward amount) and email them. Idempotent.
   * Marks the paid milestone settled so subscription pay does not double-credit.
   */
  async creditAndNotifyOnInviteUsed(referredUserId: string) {
    const { paidReward } = await this.rewardAmounts();
    if (paidReward <= 0) return;

    const referred = await this.prisma.user.findUnique({
      where: { id: referredUserId },
      select: {
        id: true,
        displayName: true,
        referredById: true,
        referralPaidRewardedAt: true,
        referralPaidSettledAt: true,
      },
    });
    if (!referred?.referredById) return;
    if (referred.referralPaidRewardedAt || referred.referralPaidSettledAt) {
      return;
    }

    const referrerId = referred.referredById;
    const now = new Date();

    await this.prisma.user.update({
      where: { id: referredUserId },
      data: {
        referralPaidRewardedAt: now,
        referralPaidSettledAt: now,
      },
    });

    let wallet = await this.prisma.platformWallet.findUnique({
      where: { userId: referrerId },
    });
    if (!wallet) {
      wallet = await this.prisma.platformWallet.create({
        data: { userId: referrerId },
      });
    }
    const balance = Number(wallet.availableBalance) + paidReward;
    await this.prisma.$transaction([
      this.prisma.platformWallet.update({
        where: { userId: referrerId },
        data: { availableBalance: balance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId: referrerId,
          amount: paidReward,
          type: 'REFERRAL_REWARD',
          description: `Referral invite used — ${referred.displayName} joined`,
          referenceId: referredUserId,
          balanceAfter: balance,
        },
      }),
    ]);

    this.notifications.referralInviteUsed(referrerId, {
      amount: paidReward,
      balance,
      inviteeName: referred.displayName,
    });

    await this.platformNotifications
      .create({
        userId: referrerId,
        type: 'REFERRAL_REWARD',
        title: `Invite used — $${paidReward.toFixed(2)} USDT`,
        body: `${referred.displayName} signed up with your link. $${paidReward.toFixed(2)} USDT was credited to your wallet.`,
        linkUrl: '/wallet',
      })
      .catch(() => undefined);

    this.logger.log(
      `Referral invite credited: $${paidReward} to ${referrerId} (${referred.displayName} joined)`,
    );
  }

  /** Called when a referred user's KYC is approved. Idempotent. Accrues unpaid reward. */
  async rewardForKyc(referredUserId: string) {
    const { kycReward } = await this.rewardAmounts();
    await this.accrueReferrerReward(
      referredUserId,
      'referralKycRewardedAt',
      kycReward,
      'completed KYC verification',
    );
  }

  /** Called when a referred user pays registration/subscription. Idempotent. Accrues unpaid reward. */
  async rewardForPaidRegistration(referredUserId: string) {
    const { paidReward } = await this.rewardAmounts();
    await this.accrueReferrerReward(
      referredUserId,
      'referralPaidRewardedAt',
      paidReward,
      'paid their subscription',
    );
  }

  /**
   * Marks a milestone as earned (unpaid). Does not credit the wallet —
   * admin settles unpaid progress into the platform wallet.
   */
  private async accrueReferrerReward(
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
    if (referred[flagField]) return;

    const referrerId = referred.referredById;

    await this.prisma.user.update({
      where: { id: referredUserId },
      data: { [flagField]: new Date() },
    });

    await this.platformNotifications
      .create({
        userId: referrerId,
        type: 'REFERRAL_REWARD',
        title: `Referral milestone — $${amount} pending`,
        body: `${referred.displayName} ${milestone}. $${amount} USDT will be paid to your wallet when the reward is settled.`,
        linkUrl: '/settings',
      })
      .catch(() => undefined);

    this.logger.log(
      `Referral accrued: $${amount} pending for ${referrerId} (${referred.displayName} ${milestone})`,
    );
  }

  private unpaidFromInvitees(
    invitees: Array<{
      referralKycRewardedAt: Date | null;
      referralPaidRewardedAt: Date | null;
      referralKycSettledAt: Date | null;
      referralPaidSettledAt: Date | null;
    }>,
    kycReward: number,
    paidReward: number,
  ) {
    const unpaidKyc = invitees.filter(
      (x) => x.referralKycRewardedAt && !x.referralKycSettledAt,
    ).length;
    const unpaidPaid = invitees.filter(
      (x) => x.referralPaidRewardedAt && !x.referralPaidSettledAt,
    ).length;
    return {
      unpaidKyc,
      unpaidPaid,
      unpaidUsdt: unpaidKyc * kycReward + unpaidPaid * paidReward,
    };
  }

  async getMyReferralInfo(userId: string) {
    const code = await this.getOrCreateCode(userId);
    const { kycReward, paidReward } = await this.rewardAmounts();

    const [referrals, earnings, settlements] = await Promise.all([
      this.prisma.user.findMany({
        where: { referredById: userId },
        select: {
          id: true,
          displayName: true,
          createdAt: true,
          registrationPaid: true,
          referralKycRewardedAt: true,
          referralPaidRewardedAt: true,
          referralKycSettledAt: true,
          referralPaidSettledAt: true,
          kyc: { select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { userId, type: 'REFERRAL_REWARD' },
        _sum: { amount: true },
      }),
      this.prisma.referralSettlement.aggregate({
        where: { userId },
        _sum: { amountUsdt: true },
        _count: true,
      }),
    ]);

    const unpaid = this.unpaidFromInvitees(referrals, kycReward, paidReward);

    return {
      code,
      link: `${this.email.frontendUrl}/register?ref=${code}`,
      rewards: { kycRewardUsdt: kycReward, paidRewardUsdt: paidReward },
      totalEarnedUsdt: Number(earnings._sum.amount ?? 0),
      pendingUsdt: unpaid.unpaidUsdt,
      totalSettlements: settlements._count,
      totalReferred: referrals.length,
      referrals: referrals.map((r) => ({
        displayName: r.displayName,
        joinedAt: r.createdAt.toISOString(),
        kycCompleted: r.kyc?.status === 'APPROVED',
        subscribed: r.registrationPaid,
        kycRewarded: Boolean(r.referralKycRewardedAt),
        paidRewarded: Boolean(r.referralPaidRewardedAt),
        kycSettled: Boolean(r.referralKycSettledAt),
        paidSettled: Boolean(r.referralPaidSettledAt),
      })),
    };
  }

  // ── Admin ────────────────────────────────────────────────────────────

  async getAdminSettings() {
    const { kycReward, paidReward } = await this.rewardAmounts();
    const [totalLinks, totalPaid, unpaidInvitees, settlements] =
      await Promise.all([
        this.prisma.user.count({ where: { referredById: { not: null } } }),
        this.prisma.walletTransaction.aggregate({
          where: { type: 'REFERRAL_REWARD' },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.user.findMany({
          where: {
            referredById: { not: null },
            OR: [
              {
                referralKycRewardedAt: { not: null },
                referralKycSettledAt: null,
              },
              {
                referralPaidRewardedAt: { not: null },
                referralPaidSettledAt: null,
              },
            ],
          },
          select: {
            referralKycRewardedAt: true,
            referralPaidRewardedAt: true,
            referralKycSettledAt: true,
            referralPaidSettledAt: true,
          },
        }),
        this.prisma.referralSettlement.aggregate({
          _sum: { amountUsdt: true },
          _count: true,
        }),
      ]);

    const unpaid = this.unpaidFromInvitees(
      unpaidInvitees,
      kycReward,
      paidReward,
    );

    return {
      kycRewardUsdt: kycReward,
      paidRewardUsdt: paidReward,
      totalReferredUsers: totalLinks,
      totalRewardsPaidUsdt: Number(totalPaid._sum.amount ?? 0),
      totalRewardsCount: totalPaid._count,
      totalSettledUsdt: Number(settlements._sum.amountUsdt ?? 0),
      totalSettlements: settlements._count,
      unpaidUsdt: unpaid.unpaidUsdt,
      unpaidKyc: unpaid.unpaidKyc,
      unpaidPaid: unpaid.unpaidPaid,
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

  async listReferrersForAdmin(limit = 100) {
    const { kycReward, paidReward } = await this.rewardAmounts();
    const referrers = await this.prisma.user.findMany({
      where: { referrals: { some: {} } },
      select: {
        id: true,
        displayName: true,
        email: true,
        referralCode: true,
        referrals: {
          select: {
            id: true,
            displayName: true,
            createdAt: true,
            registrationPaid: true,
            referralKycRewardedAt: true,
            referralPaidRewardedAt: true,
            referralKycSettledAt: true,
            referralPaidSettledAt: true,
            kyc: { select: { status: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        walletTransactions: {
          where: { type: 'REFERRAL_REWARD' },
          select: { amount: true },
        },
        referralSettlements: {
          select: { amountUsdt: true },
        },
      },
      take: limit,
    });

    return referrers
      .map((r) => {
        const unpaid = this.unpaidFromInvitees(
          r.referrals,
          kycReward,
          paidReward,
        );
        return {
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
          totalSettledUsdt: r.referralSettlements.reduce(
            (sum, s) => sum + Number(s.amountUsdt),
            0,
          ),
          unpaidKyc: unpaid.unpaidKyc,
          unpaidPaid: unpaid.unpaidPaid,
          unpaidUsdt: unpaid.unpaidUsdt,
          referrals: r.referrals.map((x) => ({
            displayName: x.displayName,
            joinedAt: x.createdAt.toISOString(),
            kycCompleted: x.kyc?.status === 'APPROVED',
            subscribed: x.registrationPaid,
            kycPendingPay: Boolean(
              x.referralKycRewardedAt && !x.referralKycSettledAt,
            ),
            paidPendingPay: Boolean(
              x.referralPaidRewardedAt && !x.referralPaidSettledAt,
            ),
          })),
        };
      })
      .sort((a, b) => b.unpaidUsdt - a.unpaidUsdt || b.totalReferred - a.totalReferred);
  }

  async listSettlements(limit = 100) {
    const rows = await this.prisma.referralSettlement.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { displayName: true, email: true, referralCode: true } },
      },
    });

    const adminIds = [...new Set(rows.map((r) => r.paidByAdminId))];
    const admins = await this.prisma.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, displayName: true, email: true },
    });
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    return rows.map((r) => {
      const admin = adminMap.get(r.paidByAdminId);
      return {
        id: r.id,
        userId: r.userId,
        displayName: r.user.displayName,
        email: r.user.email,
        referralCode: r.user.referralCode,
        amountUsdt: Number(r.amountUsdt),
        kycCount: r.kycCount,
        paidCount: r.paidCount,
        kycRewardUsdt: Number(r.kycRewardUsdt),
        paidRewardUsdt: Number(r.paidRewardUsdt),
        note: r.note,
        paidByAdminId: r.paidByAdminId,
        paidByAdminName: admin?.displayName ?? admin?.email ?? r.paidByAdminId,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * Pays all currently unpaid referral milestones for a referrer into their
   * platform wallet, then resets unpaid progress to zero. Invite relationships
   * and lifetime history are kept — new milestones accrue again from zero.
   */
  async settleReferrer(
    referrerId: string,
    adminId: string,
    note?: string,
  ) {
    const referrer = await this.prisma.user.findUnique({
      where: { id: referrerId },
      select: { id: true, displayName: true, email: true },
    });
    if (!referrer) throw new NotFoundException('Referrer not found');

    const { kycReward, paidReward } = await this.rewardAmounts();

    const unpaidInvitees = await this.prisma.user.findMany({
      where: {
        referredById: referrerId,
        OR: [
          {
            referralKycRewardedAt: { not: null },
            referralKycSettledAt: null,
          },
          {
            referralPaidRewardedAt: { not: null },
            referralPaidSettledAt: null,
          },
        ],
      },
      select: {
        id: true,
        referralKycRewardedAt: true,
        referralPaidRewardedAt: true,
        referralKycSettledAt: true,
        referralPaidSettledAt: true,
      },
    });

    const kycIds = unpaidInvitees
      .filter((x) => x.referralKycRewardedAt && !x.referralKycSettledAt)
      .map((x) => x.id);
    const paidIds = unpaidInvitees
      .filter((x) => x.referralPaidRewardedAt && !x.referralPaidSettledAt)
      .map((x) => x.id);

    const kycCount = kycIds.length;
    const paidCount = paidIds.length;
    const amount = kycCount * kycReward + paidCount * paidReward;

    if (amount <= 0) {
      throw new BadRequestException('No unpaid referral progress to settle');
    }

    const now = new Date();
    const settlement = await this.prisma.referralSettlement.create({
      data: {
        userId: referrerId,
        amountUsdt: amount,
        kycCount,
        paidCount,
        kycRewardUsdt: kycReward,
        paidRewardUsdt: paidReward,
        note: note?.trim() || null,
        paidByAdminId: adminId,
      },
    });

    try {
      if (kycIds.length > 0) {
        await this.prisma.user.updateMany({
          where: { id: { in: kycIds } },
          data: { referralKycSettledAt: now },
        });
      }
      if (paidIds.length > 0) {
        await this.prisma.user.updateMany({
          where: { id: { in: paidIds } },
          data: { referralPaidSettledAt: now },
        });
      }

      const description =
        `Referral settlement — ${kycCount} KYC × $${kycReward} + ${paidCount} sub × $${paidReward}` +
        (note?.trim() ? ` — ${note.trim()}` : '');

      let wallet = await this.prisma.platformWallet.findUnique({
        where: { userId: referrerId },
      });
      if (!wallet) {
        wallet = await this.prisma.platformWallet.create({
          data: { userId: referrerId },
        });
      }
      const balance = Number(wallet.availableBalance) + amount;
      const walletTx = await this.prisma.$transaction(async (tx) => {
        await tx.platformWallet.update({
          where: { userId: referrerId },
          data: { availableBalance: balance },
        });
        return tx.walletTransaction.create({
          data: {
            userId: referrerId,
            amount,
            type: 'REFERRAL_REWARD',
            description,
            referenceId: settlement.id,
            balanceAfter: balance,
          },
        });
      });

      await this.prisma.referralSettlement.update({
        where: { id: settlement.id },
        data: { walletTxId: walletTx.id },
      });

      this.notifications.referralSettlementPaid(referrerId, {
        amount,
        balance,
        kycCount,
        paidCount,
      });

      await this.platformNotifications
        .create({
          userId: referrerId,
          type: 'REFERRAL_REWARD',
          title: `Referral payout — $${amount.toFixed(2)} USDT`,
          body: `${kycCount} KYC and ${paidCount} subscription reward(s) were paid to your wallet.`,
          linkUrl: '/wallet',
        })
        .catch(() => undefined);

      this.logger.log(
        `Referral settled: $${amount} to ${referrerId} by admin ${adminId} (${kycCount} KYC, ${paidCount} paid)`,
      );

      return {
        settlementId: settlement.id,
        userId: referrerId,
        displayName: referrer.displayName,
        amountUsdt: amount,
        kycCount,
        paidCount,
        kycRewardUsdt: kycReward,
        paidRewardUsdt: paidReward,
        balance,
        createdAt: settlement.createdAt.toISOString(),
      };
    } catch (err) {
      // Roll back settlement markers if wallet credit failed.
      await this.prisma.referralSettlement.delete({ where: { id: settlement.id } }).catch(() => undefined);
      if (kycIds.length > 0) {
        await this.prisma.user.updateMany({
          where: { id: { in: kycIds }, referralKycSettledAt: now },
          data: { referralKycSettledAt: null },
        });
      }
      if (paidIds.length > 0) {
        await this.prisma.user.updateMany({
          where: { id: { in: paidIds }, referralPaidSettledAt: now },
          data: { referralPaidSettledAt: null },
        });
      }
      throw err;
    }
  }
}
