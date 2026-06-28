import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NowPaymentsService } from './nowpayments.service';
import { BlockchainScannerService } from './blockchain-scanner.service';

const CUSTODY_ORDER_PREFIX = 'custody:';

@Injectable()
export class CustodyDepositService {
  constructor(
    private prisma: PrismaService,
    private nowPayments: NowPaymentsService,
    private config: ConfigService,
    private blockchain: BlockchainScannerService,
  ) {}

  private ipnUrl() {
    const base =
      this.config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${this.config.get('PORT') || 4000}`;
    return `${base}/api/v1/payments/ipn`;
  }

  custodyOrderId(depositId: string) {
    return `${CUSTODY_ORDER_PREFIX}${depositId}`;
  }

  isCustodyOrderId(orderId: string) {
    return orderId.startsWith(CUSTODY_ORDER_PREFIX);
  }

  depositIdFromOrderId(orderId: string) {
    return orderId.slice(CUSTODY_ORDER_PREFIX.length);
  }

  async getWalletSummary() {
    if (!this.nowPayments.isConfigured) {
      return {
        configured: false,
        message: 'NOWPayments not configured — set NOWPAYMENTS_API_KEY',
        usdtBalance: 0,
        balances: {},
        pendingCryptoPayoutTotal: 0,
        pendingCryptoPayoutCount: 0,
      };
    }

    const [balances, pendingAgg] = await Promise.all([
      this.nowPayments.getBalance(),
      this.prisma.payout.aggregate({
        where: {
          status: 'PENDING',
          payoutMethod: { not: 'MOBILE_MONEY' },
          walletAddress: { not: null },
        },
        _sum: { traderShare: true },
        _count: true,
      }),
    ]);

    return {
      configured: true,
      usdtBalance: this.nowPayments.sumUsdtBalance(balances),
      balances,
      pendingCryptoPayoutTotal: Number(pendingAgg._sum.traderShare ?? 0),
      pendingCryptoPayoutCount: pendingAgg._count,
    };
  }

  async createDeposit(adminId: string, amount: number, network: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Deposit amount must be greater than zero');
    }

    const deposit = await this.prisma.custodyDeposit.create({
      data: {
        adminId,
        amount,
        network: network.toUpperCase(),
      },
    });

    if (!this.nowPayments.isConfigured) {
      return {
        depositId: deposit.id,
        amount,
        network: deposit.network,
        configured: false,
        message: 'NOWPayments not configured — set NOWPAYMENTS_API_KEY',
      };
    }

    const orderId = this.custodyOrderId(deposit.id);
    const npPayment = await this.nowPayments.createPayment({
      amount,
      orderId,
      network: deposit.network,
      description: 'TraderRank payout custody top-up',
      ipnCallbackUrl: this.ipnUrl(),
    });

    await this.prisma.custodyDeposit.update({
      where: { id: deposit.id },
      data: {
        gatewayId: String(npPayment.payment_id),
        gatewayResponse: npPayment as object,
        payAddress: npPayment.pay_address,
        payAmount: npPayment.pay_amount,
      },
    });

    return {
      depositId: deposit.id,
      amount,
      network: deposit.network,
      payCurrency: npPayment.pay_currency,
      payAmount: npPayment.pay_amount,
      payAddress: npPayment.pay_address,
      gatewayPaymentId: npPayment.payment_id,
      liveStatus: npPayment.payment_status,
      invoiceUrl: npPayment.invoice_url,
      configured: true,
      message:
        'Send the exact pay amount to the address below. Funds credit your NOWPayments custody balance for trader payouts.',
    };
  }

  async listDeposits(limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    return this.prisma.custodyDeposit.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: { select: { email: true, displayName: true } },
      },
    });
  }

  async getDepositStatus(depositId: string) {
    const deposit = await this.prisma.custodyDeposit.findUnique({
      where: { id: depositId },
    });
    if (!deposit) throw new NotFoundException('Custody deposit not found');

    let liveStatus: string | undefined;
    let payAddress: string | undefined;
    let payAmount: number | undefined;

    const gatewayId = deposit.gatewayId;
    if (gatewayId && this.nowPayments.isConfigured) {
      try {
        const live = await this.nowPayments.getPaymentStatus(gatewayId);
        liveStatus = live.payment_status;
        payAddress = live.pay_address;
        payAmount = live.pay_amount;

        const status = live.payment_status?.toLowerCase();
        const confirmed = ['finished', 'confirmed', 'sent'].includes(
          status || '',
        );

        if (confirmed && deposit.status !== 'CONFIRMED') {
          await this.confirmDeposit(deposit.id, live as object, gatewayId);
        } else if (status === 'failed' || status === 'expired') {
          await this.prisma.custodyDeposit.update({
            where: { id: deposit.id },
            data: {
              status: status === 'failed' ? 'FAILED' : 'EXPIRED',
              gatewayResponse: live as object,
            },
          });
        }
      } catch {
        /* use stored deposit */
      }
    }

    const stored = deposit.gatewayResponse as Record<string, unknown> | null;
    payAddress =
      payAddress || (stored?.pay_address as string | undefined);
    payAmount = payAmount ?? (stored?.pay_amount as number | undefined);

    const refreshed = await this.prisma.custodyDeposit.findUniqueOrThrow({
      where: { id: depositId },
    });

    return {
      deposit: refreshed,
      liveStatus,
      payAddress,
      payAmount,
      confirmed: refreshed.status === 'CONFIRMED',
    };
  }

  private async confirmDeposit(
    depositId: string,
    gatewayPayload: object,
    gatewayId?: string,
  ) {
    await this.prisma.custodyDeposit.update({
      where: { id: depositId },
      data: {
        status: 'CONFIRMED',
        gatewayId: gatewayId ?? undefined,
        gatewayResponse: gatewayPayload,
        confirmedAt: new Date(),
      },
    });
    return { status: 'confirmed', depositId };
  }

  async handleIpn(payload: {
    payment_id?: number;
    payment_status?: string;
    order_id?: string;
  }) {
    const orderId = payload.order_id;
    if (!orderId || !this.isCustodyOrderId(orderId)) {
      return { ignored: true };
    }

    const depositId = this.depositIdFromOrderId(orderId);
    const deposit = await this.prisma.custodyDeposit.findUnique({
      where: { id: depositId },
    });
    if (!deposit) return { ignored: true };

    const status = payload.payment_status?.toLowerCase();
    const confirmed = ['finished', 'confirmed', 'sent'].includes(status || '');

    if (confirmed) {
      return this.confirmDeposit(
        deposit.id,
        payload as object,
        String(payload.payment_id ?? deposit.gatewayId),
      );
    }

    if (status === 'failed' || status === 'expired') {
      await this.prisma.custodyDeposit.update({
        where: { id: deposit.id },
        data: {
          status: status === 'failed' ? 'FAILED' : 'EXPIRED',
          gatewayResponse: payload as object,
        },
      });
    }

    return { status: payload.payment_status, depositId: deposit.id };
  }

  async syncAllPendingDeposits() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pending = await this.prisma.custodyDeposit.findMany({
      where: {
        status: 'PENDING',
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    let confirmed = 0;
    for (const deposit of pending) {
      const result = await this.syncPendingDeposit(deposit.id);
      if (result?.confirmed) confirmed += 1;
    }

    return { scanned: pending.length, confirmed };
  }

  async syncPendingDeposit(depositId: string) {
    const deposit = await this.prisma.custodyDeposit.findUnique({
      where: { id: depositId },
    });
    if (!deposit || deposit.status !== 'PENDING') return null;

    const stored = deposit.gatewayResponse as Record<string, unknown> | null;
    const payAddress =
      deposit.payAddress || (stored?.pay_address as string | undefined);
    const payAmount =
      deposit.payAmount != null
        ? Number(deposit.payAmount)
        : stored?.pay_amount != null
          ? Number(stored.pay_amount)
          : Number(deposit.amount);

    const gatewayId = deposit.gatewayId;

    if (gatewayId && this.nowPayments.isConfigured) {
      try {
        const live = await this.nowPayments.getPaymentStatus(gatewayId);
        const status = live.payment_status?.toLowerCase();
        const confirmed = ['finished', 'confirmed', 'sent'].includes(
          status || '',
        );

        if (confirmed) {
          await this.confirmDeposit(deposit.id, live as object, gatewayId);
          return { confirmed: true, source: 'nowpayments' as const };
        }

        if (status === 'failed' || status === 'expired') {
          await this.prisma.custodyDeposit.update({
            where: { id: deposit.id },
            data: {
              status: status === 'failed' ? 'FAILED' : 'EXPIRED',
              gatewayResponse: live as object,
            },
          });
          return { confirmed: false };
        }

        if (!deposit.payAddress && live.pay_address) {
          await this.prisma.custodyDeposit.update({
            where: { id: deposit.id },
            data: {
              payAddress: live.pay_address,
              payAmount: live.pay_amount,
              gatewayResponse: live as object,
            },
          });
        }
      } catch {
        /* fall through to blockchain */
      }
    }

    if (!payAddress) return { confirmed: false };

    const chainMatch = await this.blockchain.findUsdtDeposit({
      network: deposit.network,
      payAddress,
      expectedAmount: payAmount,
      since: deposit.createdAt,
    });

    if (chainMatch) {
      await this.confirmDeposit(
        deposit.id,
        {
          blockchain: chainMatch,
          pay_address: payAddress,
          pay_amount: payAmount,
          actually_paid: chainMatch.amount,
        },
        gatewayId ?? undefined,
      );
      return { confirmed: true, source: 'blockchain' as const };
    }

    return { confirmed: false };
  }
}
