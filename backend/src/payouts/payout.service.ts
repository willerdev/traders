import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { PayoutSource, WalletTxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NowPaymentsService } from '../payments/nowpayments.service';
import { ConfigService } from '@nestjs/config';
import { ComplianceService } from '../compliance/compliance.service';
import { NotificationService } from '../email/notification.service';
import { resolvePayoutDestination } from '../common/payout.util';
import { TP_REWARD_USD } from '../common/constants';
import {
  getPayoutRewardStatus,
  getWeeklyTierPayoutsEnabled,
  resolvePayoutRewardTier,
} from './payout-reward-tier.util';
import { ProfitShareService } from '../profit-share/profit-share.service';
import {
  isDemoLeaderboardUser,
  maskDisplayNameForPublic,
} from '../common/demo-user.util';
import { WalletService } from '../wallet/wallet.service';
import { FlutterwavePaymentsService } from '../flutterwave/flutterwave-payments.service';
import { momoNetworkFromSavedWallet } from '../flutterwave/flutterwave.constants';
import { isInvestorVipActive, VIP_AI_WITHDRAW_MIN_AGE_MS } from '../investor/investor-vip.util';

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private prisma: PrismaService,
    private nowPayments: NowPaymentsService,
    private config: ConfigService,
    private compliance: ComplianceService,
    private notifications: NotificationService,
    private profitShare: ProfitShareService,
    private walletService: WalletService,
    private flutterwavePayments: FlutterwavePaymentsService,
  ) {}

  private ipnUrl() {
    const base =
      this.config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${this.config.get('PORT') || 4000}`;
    return `${base}/api/v1/payouts/ipn`;
  }

  async getRewardTier(userId: string) {
    const [status, weeklyPayoutsEnabled] = await Promise.all([
      getPayoutRewardStatus(this.prisma, userId),
      getWeeklyTierPayoutsEnabled(this.prisma),
    ]);
    return { ...status, weeklyPayoutsEnabled };
  }

  async isWeeklyTierPayoutsEnabled() {
    return getWeeklyTierPayoutsEnabled(this.prisma);
  }

  async setWeeklyTierPayoutsEnabled(enabled: boolean) {
    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', weeklyTierPayoutsEnabled: enabled },
      update: { weeklyTierPayoutsEnabled: enabled },
    });
    return { weeklyTierPayoutsEnabled: enabled };
  }

  async calculateWeeklyPayouts(weekNumber: number, year: number) {
    const weeklyTierPayoutsEnabled = await getWeeklyTierPayoutsEnabled(
      this.prisma,
    );

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

      const user = account.user;
      if (user.profitShareActive) {
        const credited = await this.profitShare.creditEarning(
          account.userId,
          virtualProfit,
          `Weekly profit share — week ${weekNumber}/${year}`,
          `weekly-${year}-${weekNumber}`,
        );
        if (credited) {
          processedUserIds.push(account.userId);
        }
        continue;
      }

      if (!weeklyTierPayoutsEnabled) {
        continue;
      }

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

  async requestProfitShareWithdrawal(userId: string, walletAddress?: string) {
    await this.compliance.requireKycForPayout(userId);

    const status = await this.profitShare.getStatus(userId);
    if (!status.active) {
      throw new BadRequestException('Profit share is not active on your account');
    }
    if (!status.canWithdraw) {
      throw new BadRequestException(
        `Profit share balance must reach $${status.withdrawThreshold.toFixed(2)} before withdrawal (currently $${status.balance.toFixed(2)})`,
      );
    }

    const openPayout = await this.prisma.payout.findFirst({
      where: {
        userId,
        source: 'PROFIT_SHARE',
        status: 'PENDING',
      },
    });
    if (openPayout) {
      if (!openPayout.walletAddress && walletAddress) {
        return this.requestPayout(userId, openPayout.id, walletAddress);
      }
      throw new BadRequestException(
        'You already have a pending profit share withdrawal',
      );
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    const { destination, method } = resolvePayoutDestination(
      profile,
      walletAddress,
    );

    const amount = status.amountToWithdraw;
    const { weekNumber, year } = this.isoWeekYear(new Date());

    const payout = await this.prisma.payout.create({
      data: {
        userId,
        source: 'PROFIT_SHARE',
        virtualProfit: amount,
        traderShare: amount,
        platformShare: 0,
        traderPercent: 100,
        weekNumber,
        year,
        status: 'PENDING',
        walletAddress: destination,
        payoutMethod: method,
        notes: `Profit share withdrawal — balance $${amount.toFixed(2)}`,
      },
    });

    await this.profitShare.deductOnPayout(userId, amount, payout.id);

    return {
      status: 'requested',
      payoutId: payout.id,
      amount,
      source: 'PROFIT_SHARE',
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

  private walletTxTypeForPayout(source: PayoutSource): WalletTxType {
    switch (source) {
      case 'TP_REWARD':
        return 'TP_REWARD';
      case 'PROFIT_SHARE':
        return 'PROFIT_SHARE';
      case 'WEEKLY':
        return 'TP_REWARD';
      default:
        return 'ADJUSTMENT';
    }
  }

  async approveAndSendPayout(payoutId: string, adminId: string, network = 'TRC20') {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'PENDING') {
      return {
        payout,
        verificationRequired: false,
        alreadyProcessed: true,
      };
    }

    const amount = Number(payout.traderShare);
    const creditToWallet = payout.source !== 'DEPOSITOR';

    if (creditToWallet) {
      const newBalance = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.platformWallet.upsert({
          where: { userId: payout.userId },
          create: { userId: payout.userId },
          update: {},
        });
        const balance = Number(wallet.availableBalance) + amount;

        await tx.platformWallet.update({
          where: { userId: payout.userId },
          data: { availableBalance: balance },
        });
        await tx.walletTransaction.create({
          data: {
            userId: payout.userId,
            amount,
            type: this.walletTxTypeForPayout(payout.source),
            referenceId: payoutId,
            description: `Payout approved — $${amount.toFixed(2)} USDT credited to wallet`,
            balanceAfter: balance,
          },
        });
        await tx.payout.update({
          where: { id: payoutId },
          data: {
            status: 'PAID',
            processedAt: new Date(),
            notes: `Approved by admin ${adminId} — $${amount.toFixed(2)} USDT credited to platform wallet`,
          },
        });

        return balance;
      });

      this.notifications.payoutCreditedToWallet(payout.userId, {
        amount,
        balance: newBalance,
        weekNumber: payout.weekNumber,
        year: payout.year,
        source: payout.source,
      });

      const updated = await this.prisma.payout.findUniqueOrThrow({
        where: { id: payoutId },
      });

      return {
        payout: updated,
        verificationRequired: false,
        creditedToWallet: true,
        walletBalance: newBalance,
      };
    }

    return this.sendExternalWalletPayout(payout, adminId);
  }

  private async sendExternalWalletPayout(
    payout: {
      id: string;
      userId: string;
      traderShare: unknown;
      walletAddress: string | null;
      payoutMethod: string | null;
      weekNumber: number;
      year: number;
      notes: string | null;
      source: PayoutSource;
    },
    adminId: string,
  ) {
    const amount = Number(payout.traderShare);
    const destination = payout.walletAddress?.trim();
    if (!destination) {
      throw new BadRequestException(
        'Cannot approve wallet withdrawal — payout destination is missing',
      );
    }

    const isMobileMoney = payout.payoutMethod === 'MOBILE_MONEY';

    if (isMobileMoney) {
      if (this.flutterwavePayments.getPublicConfig().enabled) {
        const user = await this.prisma.user.findUnique({
          where: { id: payout.userId },
          select: { displayName: true },
        });
        const phone = destination.replace(/\D/g, "").slice(-12);
        const networkMatch = payout.notes?.match(/\(MOMO_[A-Z]+\)/)?.[0];
        const momoNetwork = networkMatch
          ? momoNetworkFromSavedWallet(networkMatch.replace(/[()]/g, ""))
          : "MTN";

        try {
          const sent = await this.flutterwavePayments.sendMomoPayout({
            payoutId: payout.id,
            amountUsd: amount,
            network: momoNetwork,
            phoneNumber: phone,
            recipientName: user?.displayName?.trim() || 'Trader',
          });

          const updated = await this.prisma.payout.update({
            where: { id: payout.id },
            data: {
              gatewayPayoutId: sent.transferId,
              status: 'APPROVED',
              notes: `${payout.notes ?? ''} — Flutterwave transfer ${sent.transferId} (admin ${adminId})`.trim(),
            },
          });

          this.notifications.payoutApproved(payout.userId, {
            amount,
            walletAddress: destination,
            weekNumber: payout.weekNumber,
            year: payout.year,
          });

          return {
            payout: updated,
            verificationRequired: false,
            creditedToWallet: false,
            gatewayPayoutId: sent.transferId,
            message:
              'MoMo payout queued on Flutterwave. Funds will arrive after the customer approves on their phone if required.',
          };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Flutterwave MoMo payout failed';
          this.logger.error(`Flutterwave payout failed for ${payout.id}: ${message}`);
          throw new BadRequestException(
            `Could not queue MoMo payout on Flutterwave: ${message}`,
          );
        }
      }

      const updated = await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'PAID',
          processedAt: new Date(),
          notes: `Confirmed by admin ${adminId} — mobile money (manual transfer)`,
        },
      });

      this.notifications.payoutApproved(payout.userId, {
        amount,
        walletAddress: destination,
        weekNumber: payout.weekNumber,
        year: payout.year,
      });

      return {
        payout: updated,
        verificationRequired: false,
        creditedToWallet: false,
      };
    }

    if (!this.nowPayments.isConfigured) {
      throw new BadRequestException(
        'NOWPayments is not configured — set NOWPAYMENTS_API_KEY before approving wallet withdrawals',
      );
    }

    if (!this.nowPayments.isPayoutConfigured) {
      const status = this.nowPayments.getPayoutConfigStatus();
      const missing = [
        !status.payoutEmailSet ? 'NOWPAYMENTS_PAYOUT_EMAIL' : null,
        !status.payoutPasswordSet ? 'NOWPAYMENTS_PAYOUT_PASSWORD' : null,
      ].filter(Boolean);
      throw new BadRequestException(
        `NOWPayments payout login is not configured on traders-api — set ${missing.join(
          ' and ',
        )} on the Render backend service (not the frontend), then Manual Deploy / restart`,
      );
    }

    const currency = this.nowPayments.mapNetworkToCurrency('TRC20');
    let result: { id: string };
    try {
      result = await this.nowPayments.createPayout({
        address: destination,
        amount,
        currency,
        ipnCallbackUrl: this.ipnUrl(),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'NOWPayments payout failed';
      this.logger.error(
        `NOWPayments payout failed for ${payout.id}: ${message}`,
      );
      throw new BadRequestException(
        `Could not queue payout on NOWPayments: ${message}`,
      );
    }

    const updated = await this.prisma.payout.update({
      where: { id: payout.id },
      data: {
        gatewayPayoutId: result.id,
        status: 'APPROVED',
        notes: `${payout.notes ?? ''} — NOWPayments batch ${result.id} (admin ${adminId})`.trim(),
      },
    });

    this.notifications.payoutApproved(payout.userId, {
      amount,
      walletAddress: destination,
      weekNumber: payout.weekNumber,
      year: payout.year,
    });

    return {
      payout: updated,
      verificationRequired: false,
      gatewayPayoutId: result.id,
      creditedToWallet: false,
      message:
        'Payout queued on NOWPayments — funds will be sent to the destination wallet shortly.',
    };
  }

  async verifyGatewayPayout(
    payoutId: string,
    verificationCode: string,
    adminId: string,
  ) {
    const code = verificationCode?.trim();
    if (!code) {
      throw new BadRequestException('NOWPayments 2FA verification code is required');
    }

    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!payout.gatewayPayoutId) {
      throw new BadRequestException(
        'This payout has no pending NOWPayments batch — approve it first',
      );
    }

    await this.nowPayments.verifyPayout(payout.gatewayPayoutId, code);

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        notes: `${payout.notes ?? ''} — verified by admin ${adminId}`.trim(),
      },
    });

    return {
      payout: updated,
      message:
        'Payout verified. NOWPayments will send USDT to the trader wallet shortly.',
    };
  }

  async approvePayout(payoutId: string, adminId: string) {
    return this.approveAndSendPayout(payoutId, adminId);
  }

  /**
   * VIP support-agent path: approve+send the user's own PENDING wallet withdrawal
   * after it has been pending at least 30 minutes.
   */
  async approveVipAiWithdrawal(userId: string, payoutId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        investorVipActive: true,
        investorVipExpiresAt: true,
        kyc: { select: { status: true } },
      },
    });
    if (!isInvestorVipActive(user ?? {})) {
      throw new ForbiddenException(
        'Investor VIP is required for AI withdrawal approval',
      );
    }

    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    if (config?.requireKycForPayouts !== false) {
      if (user?.kyc?.status !== 'APPROVED') {
        throw new BadRequestException(
          'Cannot approve withdrawal — KYC is not verified',
        );
      }
    }

    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout || payout.userId !== userId) {
      throw new NotFoundException('Withdrawal not found');
    }
    if (payout.source !== 'DEPOSITOR') {
      throw new BadRequestException(
        'AI can only approve platform wallet withdrawals',
      );
    }
    if (payout.status !== 'PENDING') {
      throw new BadRequestException(
        `Withdrawal is ${payout.status}, not PENDING`,
      );
    }

    const ageMs = Date.now() - payout.requestedAt.getTime();
    if (ageMs < VIP_AI_WITHDRAW_MIN_AGE_MS) {
      const waitMin = Math.ceil((VIP_AI_WITHDRAW_MIN_AGE_MS - ageMs) / 60000);
      throw new BadRequestException(
        `Withdrawal must wait 30 minutes before AI approval — about ${waitMin} minute(s) left`,
      );
    }

    const agentId = `ai_vip_${userId}`;
    const result = await this.approveAndSendPayout(payoutId, agentId);
    this.logger.log(
      `VIP AI approved wallet withdrawal ${payoutId} for user ${userId}`,
    );
    const message =
      'message' in result && typeof result.message === 'string'
        ? result.message
        : 'Withdrawal approved — funds are being sent to your saved wallet.';
    return {
      payoutId,
      status: result.payout?.status ?? 'APPROVED',
      amountUsdt: Number(payout.traderShare),
      gatewayPayoutId:
        'gatewayPayoutId' in result ? result.gatewayPayoutId : undefined,
      message,
    };
  }

  async refundWalletWithdrawal(
    payoutId: string,
    adminId: string,
    reason?: string,
  ) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.source !== 'DEPOSITOR') {
      throw new BadRequestException(
        'Only wallet withdrawal payouts can be refunded to the platform wallet',
      );
    }
    if (payout.status === 'REJECTED') {
      throw new BadRequestException('This payout was already refunded');
    }

    const refundRef = `refund_${payoutId}`;
    const existingRefund = await this.prisma.walletTransaction.findFirst({
      where: { referenceId: refundRef },
    });
    if (existingRefund) {
      throw new BadRequestException('This payout was already refunded');
    }

    const amount = Number(payout.virtualProfit);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid payout amount');
    }

    const note =
      reason?.trim() ||
      `Refund — wallet withdrawal not sent ($${amount.toFixed(2)} USDT)`;

    const { balance } = await this.walletService.creditBalance(
      payout.userId,
      amount,
      'ADJUSTMENT',
      note,
      refundRef,
    );

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'REJECTED',
        processedAt: new Date(),
        notes: `${payout.notes ?? ''} — refunded by admin ${adminId}: ${note}`.trim(),
      },
    });

    this.notifications.walletAdminCredit(payout.userId, { amount, balance });

    return {
      payout: updated,
      amount,
      balance,
      message: `Refunded $${amount.toFixed(2)} USDT to the user's platform wallet`,
    };
  }

  async getPayoutHistory(userId: string) {
    return this.prisma.payout.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async getRecentPublicPayouts(limit = 12) {
    const take = Math.min(Math.max(limit, 1), 30);
    const rows = await this.prisma.payout.findMany({
      where: { status: 'PAID' },
      orderBy: [{ processedAt: 'desc' }, { requestedAt: 'desc' }],
      take: take * 2,
      include: {
        user: {
          select: {
            displayName: true,
            email: true,
            virtualAccount: { select: { tier: true } },
          },
        },
      },
    });

    const items = rows
      .filter((row) => !isDemoLeaderboardUser(row.user.email))
      .slice(0, take)
      .map((row) => ({
        displayName: maskDisplayNameForPublic(row.user.displayName),
        amount: Number(row.traderShare),
        tier: row.user.virtualAccount?.tier ?? 'BRONZE',
        source: row.source,
        rewardTier: row.rewardTier,
        weekNumber: row.weekNumber,
        year: row.year,
        paidAt:
          row.processedAt?.toISOString() ??
          row.requestedAt.toISOString(),
      }));

    const totalPaidAgg = await this.prisma.payout.aggregate({
      where: { status: 'PAID' },
      _sum: { traderShare: true },
      _count: true,
    });

    return {
      items,
      totalPaid: Number(totalPaidAgg._sum.traderShare ?? 0),
      payoutCount: totalPaidAgg._count,
      refreshedAt: new Date().toISOString(),
    };
  }

  async handlePayoutIpn(body: Record<string, unknown>) {
    this.logger.log(`Payout IPN received: ${JSON.stringify(body).slice(0, 400)}`);

    const payoutId =
      typeof body.id === 'string'
        ? body.id
        : typeof body.payout_id === 'string'
          ? body.payout_id
          : undefined;
    const status =
      typeof body.status === 'string'
        ? body.status.toLowerCase()
        : typeof body.payment_status === 'string'
          ? body.payment_status.toLowerCase()
          : '';

    if (payoutId) {
      const payout = await this.prisma.payout.findFirst({
        where: { gatewayPayoutId: payoutId },
      });
      if (payout && ['finished', 'confirmed', 'sent', 'completed'].includes(status)) {
        const wasPaid = payout.status === 'PAID';
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: { status: 'PAID', processedAt: new Date() },
        });
        if (!wasPaid && payout.source === 'DEPOSITOR') {
          this.logger.log(
            `Wallet withdrawal ${payout.id} marked PAID via NOWPayments IPN`,
          );
        }
      }
    }

    return { ok: true };
  }
}
