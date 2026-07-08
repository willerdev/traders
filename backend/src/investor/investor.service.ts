import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  NowPaymentsApiError,
  NowPaymentsService,
} from '../payments/nowpayments.service';
import {
  isPublicHttpsUrl,
  resolvePublicApiBaseUrl,
} from '../common/public-url.util';
import { NotificationService } from '../email/notification.service';
import { MetaApiService } from '../metaapi/metaapi.service';

@Injectable()
export class InvestorService {
  private readonly logger = new Logger(InvestorService.name);

  constructor(
    private prisma: PrismaService,
    private nowPayments: NowPaymentsService,
    private config: ConfigService,
    private notifications: NotificationService,
    private metaApi: MetaApiService,
  ) {}

  private ipnUrl() {
    const base = resolvePublicApiBaseUrl(this.config);
    const url = `${base}/api/v1/payments/ipn`;
    if (process.env.NODE_ENV === 'production' && !isPublicHttpsUrl(url)) {
      return undefined;
    }
    return url;
  }

  async investorFee(): Promise<number> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    return Number(config?.investorFeeUsdt ?? 50);
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        investorSettings: true,
        investorTrades: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { signal: { select: { signalId: true, symbol: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    let mt5Connected = false;
    let mt5HealthMessage: string | null = null;
    if (user.metaApiAccountId && this.metaApi.isConfigured) {
      try {
        const account = await this.metaApi.getAccount(user.metaApiAccountId);
        mt5Connected =
          account.state === 'DEPLOYED' &&
          account.connectionStatus === 'CONNECTED';
        mt5HealthMessage = mt5Connected
          ? 'MT5 account connected'
          : `MT5 ${account.connectionStatus}`;
      } catch (err) {
        mt5HealthMessage =
          err instanceof Error ? err.message : 'MT5 connection check failed';
      }
    }

    const fee = await this.investorFee();

    return {
      active: user.investorActive,
      enrolledAt: user.investorEnrolledAt?.toISOString() ?? null,
      feeUsdt: fee,
      mt5Linked: Boolean(user.metaApiAccountId),
      mt5Connected,
      mt5HealthMessage,
      settings: user.investorSettings
        ? {
            riskPercent: Number(user.investorSettings.riskPercent),
            useTwoToOneRr: user.investorSettings.useTwoToOneRr,
            paused: user.investorSettings.paused,
          }
        : null,
      recentTrades: user.investorTrades.map((t) => ({
        id: t.id,
        signalId: t.signal.signalId,
        symbol: t.symbol,
        direction: t.direction,
        status: t.status,
        profit: t.profit != null ? Number(t.profit) : null,
        notes: t.notes,
        executedAt: t.executedAt?.toISOString() ?? null,
        closedAt: t.closedAt?.toISOString() ?? null,
      })),
    };
  }

  async createEnrollmentCheckout(userId: string, network: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.investorActive) {
      return {
        message: 'Investor program is already active',
        active: true,
        enrolledAt: user.investorEnrolledAt?.toISOString() ?? null,
      };
    }

    const amount = await this.investorFee();
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount,
        currency: 'USDT',
        network,
        purpose: 'investor_enrollment',
        gatewayId: `pending_${Date.now()}`,
      },
    });

    if (!this.nowPayments.isConfigured) {
      throw new ServiceUnavailableException(
        'Crypto payments are not configured — contact support',
      );
    }

    try {
      const npPayment = await this.nowPayments.createPayment({
        amount,
        orderId: payment.id,
        network,
        description: 'TraderRank investor program enrollment',
        ipnCallbackUrl: this.ipnUrl(),
      });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayId: String(npPayment.payment_id),
          gatewayResponse: npPayment as object,
          payAddress: npPayment.pay_address,
          payAmount: npPayment.pay_amount,
        },
      });

      return {
        paymentId: payment.id,
        amount,
        currency: 'USDT',
        network,
        purpose: 'investor_enrollment',
        payCurrency: npPayment.pay_currency,
        payAmount: npPayment.pay_amount,
        payAddress: npPayment.pay_address,
        gatewayPaymentId: npPayment.payment_id,
        liveStatus: npPayment.payment_status,
        gateway: 'NOWPayments',
        orderId: payment.id,
      };
    } catch (err) {
      await this.prisma.payment
        .delete({ where: { id: payment.id } })
        .catch(() => undefined);
      if (err instanceof NowPaymentsApiError) {
        throw new BadRequestException(
          err.message || 'Could not create enrollment payment',
        );
      }
      throw err;
    }
  }

  async confirmEnrollment(
    paymentId: string,
    gatewayPayload: object,
    opts?: { gatewayId?: string; txHash?: string },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.status === 'CONFIRMED') {
      return { alreadyConfirmed: true };
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: now,
          gatewayResponse: gatewayPayload as object,
          ...(opts?.gatewayId ? { gatewayId: opts.gatewayId } : {}),
          ...(opts?.txHash ? { txHash: opts.txHash } : {}),
        },
      }),
      this.prisma.user.update({
        where: { id: payment.userId },
        data: {
          investorActive: true,
          investorEnrolledAt: now,
        },
      }),
      this.prisma.investorSettings.upsert({
        where: { userId: payment.userId },
        create: { userId: payment.userId, riskPercent: 2 },
        update: {},
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId: payment.userId,
          amount: -Number(payment.amount),
          type: 'INVESTOR_FEE',
          referenceId: paymentId,
          description: `Investor program enrollment — $${Number(payment.amount).toFixed(2)} USDT`,
        },
      }),
    ]);

    this.notifications.investorEnrollmentConfirmed(payment.userId, {
      amount: Number(payment.amount),
    });

    return { confirmed: true, userId: payment.userId };
  }

  async updateSettings(userId: string, riskPercent: number) {
    if (!Number.isFinite(riskPercent) || riskPercent < 0.5 || riskPercent > 10) {
      throw new BadRequestException('Risk must be between 0.5% and 10%');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.investorActive) {
      throw new BadRequestException('Enroll in the investor program first');
    }

    const settings = await this.prisma.investorSettings.upsert({
      where: { userId },
      create: { userId, riskPercent },
      update: { riskPercent },
    });

    this.notifications.investorRiskUpdated(userId, { riskPercent });

    return {
      riskPercent: Number(settings.riskPercent),
      useTwoToOneRr: settings.useTwoToOneRr,
      paused: settings.paused,
    };
  }

  async setPaused(userId: string, paused: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.investorActive) {
      throw new BadRequestException('Enroll in the investor program first');
    }

    await this.prisma.investorSettings.upsert({
      where: { userId },
      create: { userId, paused },
      update: { paused },
    });

    if (paused) {
      this.notifications.investorPaused(userId);
    } else {
      this.notifications.investorResumed(userId);
    }

    return { paused };
  }
}
