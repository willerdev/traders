import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NowPaymentsService } from '../payments/nowpayments.service';
import { ConfigService } from '@nestjs/config';
import { ComplianceService } from '../compliance/compliance.service';
import { NotificationService } from '../email/notification.service';
import { resolvePayoutDestination } from '../common/payout.util';
import { TP_REWARD_USD } from '../common/constants';
import {
  getPayoutRewardStatus,
  resolvePayoutRewardTier,
} from './payout-reward-tier.util';

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private prisma: PrismaService,
    private nowPayments: NowPaymentsService,
    private config: ConfigService,
    private compliance: ComplianceService,
    private notifications: NotificationService,
  ) {}

  private ipnUrl() {
    const base =
      this.config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${this.config.get('PORT') || 4000}`;
    return `${base}/api/v1/payouts/ipn`;
  }

  async getRewardTier(userId: string) {
    return getPayoutRewardStatus(this.prisma, userId);
  }

  async calculateWeeklyPayouts(weekNumber: number, year: number) {
    const accounts = await this.prisma.virtualAccount.findMany({
      where: { weeklyProfit: { gt: 0 } },
      include: { user: true },
    });

    const payouts: Awaited<ReturnType<typeof this.prisma.payout.create>>[] = [];
    const processedUserIds: string[] = [];

    for (const account of accounts) {
      const existing = await this.prisma.payout.findFirst({
        where: { userId: account.userId, weekNumber, year },
      });
      if (existing) continue;

      const virtualProfit = Number(account.weeklyProfit);
      if (virtualProfit <= 0) continue;

      const rewardStatus = await getPayoutRewardStatus(
        this.prisma,
        account.userId,
      );
      const tier = resolvePayoutRewardTier(rewardStatus.wins);
      const traderShare = tier.amountUsdt;
      const platformShare = Math.max(0, virtualProfit - traderShare);

      const payout = await this.prisma.payout.create({
        data: {
          userId: account.userId,
          virtualProfit,
          traderShare,
          platformShare,
          traderPercent: virtualProfit > 0 ? (traderShare / virtualProfit) * 100 : 0,
          rewardTier: tier.tierId,
          weekNumber,
          year,
          status: 'PENDING',
          notes: `${tier.label} tier — ${rewardStatus.wins}/${rewardStatus.windowSize} wins in rolling window`,
        },
      });

      payouts.push(payout);
      processedUserIds.push(account.userId);

      this.notifications.payoutAvailable(account.userId, {
        amount: traderShare,
        weekNumber,
        year,
      });
    }

    if (processedUserIds.length > 0) {
      await this.prisma.virtualAccount.updateMany({
        where: { userId: { in: processedUserIds } },
        data: { weeklyProfit: 0 },
      });
    }

    return payouts;
  }

  async requestPayout(
    userId: string,
    payoutId: string,
    walletAddress?: string,
  ) {
    await this.compliance.requireKycForPayout(userId);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    const { destination, method } = resolvePayoutDestination(
      profile,
      walletAddress,
    );

    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'PENDING') {
      throw new BadRequestException('This payout is no longer open for requests');
    }

    return this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        walletAddress: destination,
        payoutMethod: method,
        requestedAt: new Date(),
        status: 'PENDING',
      },
    });
  }

  async requestTpClaimPayout(
    userId: string,
    tpClaimId: string,
    walletAddress?: string,
  ) {
    await this.compliance.requireKycForPayout(userId);

    const claim = await this.prisma.tpClaim.findUnique({
      where: { id: tpClaimId },
      include: {
        payout: true,
        signal: { select: { signalId: true } },
      },
    });

    if (!claim) throw new NotFoundException('TP claim not found');
    if (claim.userId !== userId) {
      throw new ForbiddenException('You can only request payout for your own claims');
    }
    if (claim.status !== 'APPROVED') {
      throw new BadRequestException(
        'Only approved TP claims can request a payout',
      );
    }

    if (claim.payout) {
      if (
        claim.payout.status === 'PENDING' &&
        !claim.payout.walletAddress
      ) {
        return this.requestPayout(userId, claim.payout.id, walletAddress);
      }
      throw new BadRequestException(
        'A payout has already been requested for this TP claim',
      );
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    const { destination, method } = resolvePayoutDestination(
      profile,
      walletAddress,
    );

    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const reward = Number(config?.tpRewardUsd ?? TP_REWARD_USD);
    const reviewed = claim.reviewedAt ?? new Date();
    const { weekNumber, year } = this.isoWeekYear(reviewed);

    const payout = await this.prisma.payout.create({
      data: {
        userId,
        tpClaimId,
        source: 'TP_REWARD',
        virtualProfit: reward,
        traderShare: reward,
        platformShare: 0,
        traderPercent: 100,
        weekNumber,
        year,
        status: 'PENDING',
        walletAddress: destination,
        payoutMethod: method,
        notes: `TP reward — ${claim.symbol} (${claim.signal.signalId})`,
      },
    });

    return {
      status: 'requested',
      payoutId: payout.id,
      amount: reward,
      claimId: tpClaimId,
      symbol: claim.symbol,
    };
  }

  private isoWeekYear(date: Date): { weekNumber: number; year: number } {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return { weekNumber, year: d.getUTCFullYear() };
  }

  async approveAndSendPayout(payoutId: string, adminId: string, network = 'TRC20') {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!payout.walletAddress) {
      throw new Error('Trader payout destination required');
    }

    let gatewayResponse: object | undefined;
    const isMobileMoney = payout.payoutMethod === 'MOBILE_MONEY';

    if (!isMobileMoney && this.nowPayments.isConfigured) {
      try {
        const currency = this.nowPayments.mapNetworkToCurrency(network);
        gatewayResponse = await this.nowPayments.createPayout({
          address: payout.walletAddress,
          amount: Number(payout.traderShare),
          currency,
          ipnCallbackUrl: this.ipnUrl(),
        });
      } catch (err) {
        await this.prisma.payout.update({
          where: { id: payoutId },
          data: {
            notes: `Payout API error: ${err instanceof Error ? err.message : 'unknown'}`,
          },
        });
        throw err;
      }
    }

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'APPROVED',
        processedAt: new Date(),
        notes: isMobileMoney
          ? `Approved by admin ${adminId} — mobile money (manual transfer)`
          : `Approved by admin ${adminId}${gatewayResponse ? ' — sent via NOWPayments' : ''}`,
      },
    });

    await this.prisma.walletTransaction.create({
      data: {
        userId: payout.userId,
        amount: -Number(payout.traderShare),
        type: 'PAYOUT',
        referenceId: payoutId,
        description: isMobileMoney
          ? `Mobile money payout — ${payout.walletAddress.slice(0, 24)}…`
          : `Crypto payout to ${payout.walletAddress.slice(0, 8)}...`,
      },
    });

    if (payout.walletAddress) {
      this.notifications.payoutApproved(payout.userId, {
        amount: Number(payout.traderShare),
        walletAddress: payout.walletAddress,
        weekNumber: payout.weekNumber,
        year: payout.year,
      });
    }

    return { payout: updated, gatewayResponse };
  }

  async approvePayout(payoutId: string, adminId: string) {
    return this.approveAndSendPayout(payoutId, adminId);
  }

  async getPayoutHistory(userId: string) {
    return this.prisma.payout.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async handlePayoutIpn(body: Record<string, unknown>) {
    this.logger.log(`Payout IPN received: ${JSON.stringify(body).slice(0, 400)}`);
    return { ok: true };
  }
}
