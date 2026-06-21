import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PLATFORM_PAYOUT_PERCENT,
  TRADER_PAYOUT_PERCENT,
} from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { NowPaymentsService } from '../payments/nowpayments.service';
import { ConfigService } from '@nestjs/config';
import { ComplianceService } from '../compliance/compliance.service';

@Injectable()
export class PayoutService {
  constructor(
    private prisma: PrismaService,
    private nowPayments: NowPaymentsService,
    private config: ConfigService,
    private compliance: ComplianceService,
  ) {}

  private ipnUrl() {
    const base =
      this.config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${this.config.get('PORT') || 4000}`;
    return `${base}/api/v1/payouts/ipn`;
  }

  async calculateWeeklyPayouts(weekNumber: number, year: number) {
    const accounts = await this.prisma.virtualAccount.findMany({
      where: { weeklyProfit: { gt: 0 } },
      include: { user: true },
    });

    const payouts: Awaited<ReturnType<typeof this.prisma.payout.create>>[] = [];

    for (const account of accounts) {
      const virtualProfit = Number(account.weeklyProfit);
      const traderShare = (virtualProfit * TRADER_PAYOUT_PERCENT) / 100;
      const platformShare = (virtualProfit * PLATFORM_PAYOUT_PERCENT) / 100;

      const payout = await this.prisma.payout.create({
        data: {
          userId: account.userId,
          virtualProfit,
          traderShare,
          platformShare,
          traderPercent: TRADER_PAYOUT_PERCENT,
          weekNumber,
          year,
          status: 'PENDING',
        },
      });

      payouts.push(payout);
    }

    return payouts;
  }

  async requestPayout(userId: string, payoutId: string, walletAddress: string) {
    await this.compliance.requireKycForPayout(userId);

    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
    });
    if (!payout) throw new NotFoundException('Payout not found');

    return this.prisma.payout.update({
      where: { id: payoutId },
      data: { walletAddress, status: 'PENDING' },
    });
  }

  async approveAndSendPayout(payoutId: string, adminId: string, network = 'TRC20') {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!payout.walletAddress) {
      throw new Error('Trader wallet address required');
    }

    let gatewayResponse: object | undefined;

    if (this.nowPayments.isConfigured) {
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
        notes: `Approved by admin ${adminId}${gatewayResponse ? ' — sent via NOWPayments' : ''}`,
      },
    });

    await this.prisma.walletTransaction.create({
      data: {
        userId: payout.userId,
        amount: -Number(payout.traderShare),
        type: 'PAYOUT',
        referenceId: payoutId,
        description: `Crypto payout to ${payout.walletAddress.slice(0, 8)}...`,
      },
    });

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
}
