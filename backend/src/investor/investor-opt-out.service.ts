import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InvestorOptOutStatus } from '@prisma/client';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../email/notification.service';
import { isSoloApp } from '../common/app-variant';
import {
  INVESTOR_WEEKLY_PROFIT_FRACTION,
  OPT_OUT_POLICY,
  OPT_OUT_REASON_OPTIONS,
  WITHDRAW_40_BY_SATURDAY_LABEL,
  formatKampalaWhen,
  isOptOutReasonCode,
  kampalaIsoWeekKey,
  maintenanceUntilFrom,
  maskInvestorEmail,
  optOutReasonLabel,
  optOutSchedule,
  roundUsdt,
} from './investor-opt-out.util';

const OPT_OUT_VERIFY_TTL_MS = 10 * 60 * 1000;
const OPT_OUT_VERIFY_RESEND_MS = 60 * 1000;
const OPT_OUT_VERIFY_MAX_ATTEMPTS = 5;

@Injectable()
export class InvestorOptOutService {
  private readonly logger = new Logger(InvestorOptOutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async hasCoolingOptOut(userId: string): Promise<boolean> {
    const row = await this.prisma.investorOptOut.findFirst({
      where: { userId, status: InvestorOptOutStatus.COOLING },
      select: { id: true },
    });
    return Boolean(row);
  }

  async isMaintenanceActive(now = new Date()): Promise<boolean> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
      select: { investorMaintenanceUntil: true },
    });
    return Boolean(
      config?.investorMaintenanceUntil &&
        config.investorMaintenanceUntil.getTime() > now.getTime(),
    );
  }

  async enableMaintenanceWindow(now = new Date()) {
    const until = maintenanceUntilFrom(now);
    await this.prisma.platformConfig.update({
      where: { id: 'default' },
      data: {
        investorMaintenanceUntil: until,
        investorWeeklyProfitFraction: INVESTOR_WEEKLY_PROFIT_FRACTION,
        investorProfitSnapshotAt: now,
      },
    });
    await this.snapshotRemainingInvestorProfits();
    return { until };
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { investorActive: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const books = await this.snapshotBooks(userId);
    const cooling = await this.prisma.investorOptOut.findFirst({
      where: { userId, status: InvestorOptOutStatus.COOLING },
    });
    const latest = cooling
      ? cooling
      : await this.prisma.investorOptOut.findFirst({
          where: { userId },
          orderBy: { requestedAt: 'desc' },
        });
    const maintenanceActive = await this.isMaintenanceActive();
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
      select: {
        investorMaintenanceUntil: true,
        investorWeeklyProfitFraction: true,
      },
    });

    return {
      eligible: Boolean(user.investorActive) && !cooling,
      investorActive: Boolean(user.investorActive),
      policy: OPT_OUT_POLICY,
      reasons: OPT_OUT_REASON_OPTIONS,
      books,
      maintenance: {
        active: maintenanceActive,
        until: config?.investorMaintenanceUntil?.toISOString() ?? null,
        weeklyProfitPercent: roundUsdt(
          Number(config?.investorWeeklyProfitFraction ?? INVESTOR_WEEKLY_PROFIT_FRACTION) *
            100,
        ),
        withdraw40By: WITHDRAW_40_BY_SATURDAY_LABEL,
      },
      request: latest
        ? {
            id: latest.id,
            status: latest.status,
            reasonCode: latest.reasonCode,
            reasonNote: latest.reasonNote,
            reasonLabel: optOutReasonLabel(latest.reasonCode, latest.reasonNote),
            capitalUsdt: roundUsdt(Number(latest.capitalUsdt)),
            profitToDateUsdt: roundUsdt(Number(latest.profitToDateUsdt)),
            walletUsdt: roundUsdt(Number(latest.walletUsdt)),
            investUsdt: roundUsdt(Number(latest.investUsdt)),
            requestedAt: latest.requestedAt.toISOString(),
            requestedAtLabel: formatKampalaWhen(latest.requestedAt),
            day3At: latest.day3At.toISOString(),
            settleAt: latest.settleAt.toISOString(),
            day3AtLabel: formatKampalaWhen(latest.day3At),
            settleAtLabel: formatKampalaWhen(latest.settleAt),
            day3ReportSentAt: latest.day3ReportSentAt?.toISOString() ?? null,
            settledAt: latest.settledAt?.toISOString() ?? null,
            report: latest.reportJson,
          }
        : null,
      verify: await this.verifyStatus(userId, user.email),
    };
  }

  async sendVerifyEmail(userId: string) {
    if (isSoloApp()) {
      throw new BadRequestException('Smart Invest redeem is not available here');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { investorActive: true, email: true, displayName: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.investorActive) {
      throw new BadRequestException('Enroll in Smart Invest before redeeming');
    }
    const email = user.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'Add an email address to your account before redeeming Smart Invest',
      );
    }

    const cooling = await this.prisma.investorOptOut.findFirst({
      where: { userId, status: InvestorOptOutStatus.COOLING },
      select: { id: true },
    });
    if (cooling) {
      throw new BadRequestException('A redeem is already in progress');
    }

    const recent = await this.prisma.investorOptOutVerify.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < OPT_OUT_VERIFY_RESEND_MS
    ) {
      const waitSec = Math.ceil(
        (OPT_OUT_VERIFY_RESEND_MS -
          (Date.now() - recent.createdAt.getTime())) /
          1000,
      );
      throw new BadRequestException(
        `Wait ${waitSec}s before requesting another verification code`,
      );
    }

    await this.prisma.investorOptOutVerify.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = String(randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(code, 10);
    const session = await this.prisma.investorOptOutVerify.create({
      data: {
        userId,
        email,
        codeHash,
        expiresAt: new Date(Date.now() + OPT_OUT_VERIFY_TTL_MS),
      },
    });

    const emailSent = await this.notifications.investorOptOutVerifyEmail(
      email,
      code,
      { displayName: user.displayName },
    );
    if (!emailSent) {
      await this.prisma.investorOptOutVerify.update({
        where: { id: session.id },
        data: { usedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        'Could not send the verification email. Try again shortly.',
      );
    }

    return {
      email,
      emailMasked: maskInvestorEmail(email),
      expiresIn: OPT_OUT_VERIFY_TTL_MS / 1000,
      cooldownSec: OPT_OUT_VERIFY_RESEND_MS / 1000,
      message: 'Check your email for a 6-digit verification code',
    };
  }

  async requestOptOut(
    userId: string,
    body: {
      reasonCode?: string;
      reasonNote?: string;
      acknowledged?: boolean;
      verificationCode?: string;
    },
  ) {
    if (isSoloApp()) {
      throw new BadRequestException('Smart Invest opt-out is not available here');
    }
    if (body.acknowledged !== true) {
      throw new BadRequestException(
        'Confirm that you understand capital is returned in 5 business days and full profits are not guaranteed',
      );
    }
    const reasonCode = (body.reasonCode ?? '').trim().toUpperCase();
    if (!isOptOutReasonCode(reasonCode)) {
      throw new BadRequestException('Choose a reason for ending Smart Invest');
    }
    const reasonNote = body.reasonNote?.trim() || null;
    if (reasonCode === 'OTHER' && !reasonNote) {
      throw new BadRequestException('Please add a short note for “Other”');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { investorActive: true },
    });
    if (!user?.investorActive) {
      throw new BadRequestException('Enroll in Smart Invest before opting out');
    }

    const existing = await this.prisma.investorOptOut.findFirst({
      where: { userId, status: InvestorOptOutStatus.COOLING },
    });
    if (existing) {
      throw new BadRequestException('An opt-out is already in progress');
    }

    await this.consumeVerifyCode(userId, body.verificationCode);

    const books = await this.snapshotBooks(userId);
    const now = new Date();
    const { day3At, settleAt } = optOutSchedule(now);
    const report = this.buildReport(books, settleAt);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.investorOptOut.create({
        data: {
          userId,
          status: InvestorOptOutStatus.COOLING,
          reasonCode,
          reasonNote,
          capitalUsdt: books.capitalUsdt,
          profitToDateUsdt: books.profitToDateUsdt,
          walletUsdt: books.walletUsdt,
          investUsdt: books.investUsdt,
          requestedAt: now,
          day3At,
          settleAt,
          reportJson: report,
        },
      });
      await tx.investorSettings.upsert({
        where: { userId },
        create: { userId, paused: true, yieldPaused: true },
        update: { paused: true, yieldPaused: true },
      });
      return created;
    });

    await this.prisma.platformNotification.create({
      data: {
        userId,
        type: 'INVESTOR_OPT_OUT',
        title: 'Smart Invest opt-out started',
        body: `Capital of $${books.capitalUsdt.toFixed(2)} USDT is scheduled to return on ${formatKampalaWhen(settleAt)}. Full profits are not guaranteed.`,
        linkUrl: '/invest',
      },
    });

    this.notifications.investorOptOutRequested(userId, {
      capitalUsdt: books.capitalUsdt,
      profitToDateUsdt: books.profitToDateUsdt,
      profitsKeptUsdt: report.profitsKeptUsdt,
      profitsNotPaidUsdt: report.profitsNotPaidUsdt,
      investUsdt: books.investUsdt,
      walletUsdt: books.walletUsdt,
      reasonCode,
      reasonNote,
      reasonLabel: optOutReasonLabel(reasonCode, reasonNote),
      requestedAt: now,
      day3At,
      settleAt,
    });

    return this.getStatus(userId);
  }

  async tickDueOptOuts() {
    if (isSoloApp()) return { reports: 0, settled: 0, skipped: 'solo_app' as const };
    const now = new Date();
    const dueReports = await this.prisma.investorOptOut.findMany({
      where: {
        status: InvestorOptOutStatus.COOLING,
        day3At: { lte: now },
        day3ReportSentAt: null,
      },
    });
    let reports = 0;
    for (const row of dueReports) {
      await this.sendDay3Report(row.id);
      reports++;
    }

    const dueSettle = await this.prisma.investorOptOut.findMany({
      where: {
        status: InvestorOptOutStatus.COOLING,
        settleAt: { lte: now },
      },
    });
    let settled = 0;
    for (const row of dueSettle) {
      await this.settle(row.id);
      settled++;
    }
    return { reports, settled };
  }

  async creditWeeklyMaintenanceProfits() {
    if (isSoloApp()) return { credited: 0, skipped: 'solo_app' as const };
    if (!(await this.isMaintenanceActive())) {
      return { credited: 0, skipped: 'not_active' as const };
    }
    const weekKey = kampalaIsoWeekKey();
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
      select: { investorWeeklyProfitFraction: true },
    });
    const fraction = Number(
      config?.investorWeeklyProfitFraction ?? INVESTOR_WEEKLY_PROFIT_FRACTION,
    );
    if (!(fraction > 0)) return { credited: 0, skipped: 'zero_fraction' as const };

    await this.snapshotRemainingInvestorProfits();

    const coolingIds = (
      await this.prisma.investorOptOut.findMany({
        where: { status: InvestorOptOutStatus.COOLING },
        select: { userId: true },
      })
    ).map((r) => r.userId);

    const investors = await this.prisma.user.findMany({
      where: {
        investorActive: true,
        id: coolingIds.length ? { notIn: coolingIds } : undefined,
      },
      include: {
        investorSettings: true,
        platformWallet: true,
      },
    });

    let credited = 0;
    for (const user of investors) {
      if (user.investorSettings?.lastWeeklyMaintenanceWeek === weekKey) continue;
      const base = roundUsdt(
        Number(user.investorSettings?.maintenanceProfitSnapshot ?? 0),
      );
      const amount = roundUsdt(base * fraction);
      if (amount <= 0) {
        await this.prisma.investorSettings.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            lastWeeklyMaintenanceWeek: weekKey,
            maintenanceProfitSnapshot: base,
          },
          update: { lastWeeklyMaintenanceWeek: weekKey },
        });
        continue;
      }

      const wallet = user.platformWallet;
      const available = roundUsdt(Number(wallet?.availableBalance ?? 0));
      const next = roundUsdt(available + amount);
      await this.prisma.$transaction([
        this.prisma.platformWallet.upsert({
          where: { userId: user.id },
          create: { userId: user.id, availableBalance: amount },
          update: { availableBalance: next },
        }),
        this.prisma.walletTransaction.create({
          data: {
            userId: user.id,
            amount,
            type: 'INVESTOR_EARNING',
            referenceId: `maint_weekly_20_${weekKey}`,
            description: `Maintenance weekly profit share — 20% of $${base.toFixed(2)} Smart Invest profits ($${amount.toFixed(2)} USDT)`,
            balanceAfter: next,
          },
        }),
        this.prisma.investorSettings.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            lastWeeklyMaintenanceWeek: weekKey,
            maintenanceProfitSnapshot: base,
          },
          update: { lastWeeklyMaintenanceWeek: weekKey },
        }),
      ]);
      this.notifications.investorWeeklyMaintenanceProfit(user.id, {
        amount,
        base,
        weekKey,
      });
      credited++;
    }
    return { credited, weekKey };
  }

  async listAdmin(limit = 50) {
    const rows = await this.prisma.investorOptOut.findMany({
      take: Math.min(Math.max(limit, 1), 200),
      orderBy: { requestedAt: 'desc' },
      include: {
        user: { select: { displayName: true, email: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      reasonCode: r.reasonCode,
      reasonNote: r.reasonNote,
      capitalUsdt: roundUsdt(Number(r.capitalUsdt)),
      profitToDateUsdt: roundUsdt(Number(r.profitToDateUsdt)),
      requestedAt: r.requestedAt.toISOString(),
      day3At: r.day3At.toISOString(),
      settleAt: r.settleAt.toISOString(),
      settledAt: r.settledAt?.toISOString() ?? null,
      displayName: r.user.displayName,
      email: r.user.email,
    }));
  }

  private async verifyStatus(userId: string, email: string | null) {
    const last = await this.prisma.investorOptOutVerify.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const elapsed = last
      ? Date.now() - last.createdAt.getTime()
      : Number.POSITIVE_INFINITY;
    const cooldownSec = Math.max(
      0,
      Math.ceil((OPT_OUT_VERIFY_RESEND_MS - elapsed) / 1000),
    );
    return {
      emailMasked: maskInvestorEmail(email),
      cooldownSec,
      pending: Boolean(
        last && !last.usedAt && last.expiresAt.getTime() > Date.now(),
      ),
    };
  }

  private async consumeVerifyCode(
    userId: string,
    rawCode: string | undefined,
  ) {
    const code = (rawCode ?? '').trim();
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException(
        'Enter the 6-digit verification code we emailed you',
      );
    }
    const session = await this.prisma.investorOptOutVerify.findFirst({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) {
      throw new BadRequestException(
        'Send a verification code to your email first, then enter it here',
      );
    }
    if (session.attempts >= OPT_OUT_VERIFY_MAX_ATTEMPTS) {
      await this.prisma.investorOptOutVerify.update({
        where: { id: session.id },
        data: { usedAt: new Date() },
      });
      throw new BadRequestException(
        'Too many incorrect codes. Send a new verification code',
      );
    }
    const valid = await bcrypt.compare(code, session.codeHash);
    if (!valid) {
      const attempts = session.attempts + 1;
      await this.prisma.investorOptOutVerify.update({
        where: { id: session.id },
        data: {
          attempts,
          usedAt: attempts >= OPT_OUT_VERIFY_MAX_ATTEMPTS ? new Date() : null,
        },
      });
      throw new BadRequestException(
        attempts >= OPT_OUT_VERIFY_MAX_ATTEMPTS
          ? 'Too many incorrect codes. Send a new verification code'
          : 'That verification code is incorrect',
      );
    }
    await this.prisma.investorOptOutVerify.update({
      where: { id: session.id },
      data: { usedAt: new Date() },
    });
  }

  private async snapshotBooks(userId: string) {
    const [wallet, allocateAgg, tradingProfitAgg, walletEarningsAgg] =
      await Promise.all([
        this.prisma.platformWallet.findUnique({ where: { userId } }),
        this.prisma.walletTransaction.aggregate({
          where: { userId, type: 'INVESTOR_ALLOCATE' },
          _sum: { amount: true },
        }),
        this.prisma.investorTrade.aggregate({
          where: { userId, status: 'CLOSED', profit: { not: null } },
          _sum: { profit: true },
        }),
        this.prisma.investorDailyCredit.aggregate({
          where: { userId },
          _sum: { amount: true },
        }),
      ]);
    const investUsdt = roundUsdt(Number(wallet?.investorBalance ?? 0));
    const walletUsdt = roundUsdt(Number(wallet?.availableBalance ?? 0));
    const allocated = Math.abs(Number(allocateAgg._sum.amount ?? 0));
    const capitalUsdt = investUsdt;
    const tradingProfit = Number(tradingProfitAgg._sum.profit ?? 0);
    const walletEarnings = Number(walletEarningsAgg._sum.amount ?? 0);
    const profitToDateUsdt = roundUsdt(tradingProfit + walletEarnings);
    return {
      capitalUsdt,
      profitToDateUsdt,
      walletUsdt,
      investUsdt,
      allocatedUsdt: roundUsdt(allocated),
    };
  }

  private buildReport(
    books: Awaited<ReturnType<InvestorOptOutService['snapshotBooks']>>,
    settleAt: Date,
  ) {
    return {
      capitalRefundUsdt: books.capitalUsdt,
      profitsKeptUsdt: books.profitToDateUsdt,
      profitsNotPaidUsdt: 0,
      note:
        'Capital in Smart Invest is returned on business day 5. Profits already credited to your wallet stay there. Future daily yield and unsettled trading P&L during the cooling period are not paid.',
      settleAt: settleAt.toISOString(),
    };
  }

  private async sendDay3Report(optOutId: string) {
    const row = await this.prisma.investorOptOut.findUnique({
      where: { id: optOutId },
    });
    if (!row || row.day3ReportSentAt || row.status !== InvestorOptOutStatus.COOLING) {
      return;
    }
    const live = await this.snapshotBooks(row.userId);
    const report = {
      capitalRefundUsdt: roundUsdt(Math.min(Number(row.capitalUsdt), live.investUsdt)),
      profitsKeptUsdt: live.profitToDateUsdt,
      profitsNotPaidUsdt: roundUsdt(
        Math.max(0, Number(row.profitToDateUsdt) ? 0 : 0),
      ),
      futureYieldStopped: true,
      settleAt: row.settleAt.toISOString(),
      settleAtLabel: formatKampalaWhen(row.settleAt),
    };
    // Losing = they will not earn more daily yield on remaining capital until settle.
    const estimatedMissed = roundUsdt(Number(row.capitalUsdt) * 0);
    report.profitsNotPaidUsdt = estimatedMissed;

    await this.prisma.investorOptOut.update({
      where: { id: row.id },
      data: { day3ReportSentAt: new Date(), reportJson: report },
    });
    await this.prisma.platformNotification.create({
      data: {
        userId: row.userId,
        type: 'INVESTOR_OPT_OUT_REPORT',
        title: 'Smart Invest refund report',
        body: `Capital to return: $${report.capitalRefundUsdt.toFixed(2)} USDT. Profits already received: $${report.profitsKeptUsdt.toFixed(2)} USDT. Settlement ${report.settleAtLabel}.`,
        linkUrl: '/invest',
      },
    });
    this.notifications.investorOptOutDay3Report(row.userId, {
      capitalUsdt: report.capitalRefundUsdt,
      profitsKeptUsdt: report.profitsKeptUsdt,
      profitsNotPaidUsdt: report.profitsNotPaidUsdt,
      settleAt: row.settleAt,
    });
    this.logger.log(`Day-3 opt-out report sent for ${row.userId}`);
  }

  private async settle(optOutId: string) {
    const row = await this.prisma.investorOptOut.findUnique({
      where: { id: optOutId },
    });
    if (!row || row.status !== InvestorOptOutStatus.COOLING) return;

    const wallet = await this.prisma.platformWallet.findUnique({
      where: { userId: row.userId },
    });
    const liveInvest = roundUsdt(Number(wallet?.investorBalance ?? 0));
    const refund = roundUsdt(Math.min(Number(row.capitalUsdt), liveInvest));
    const available = roundUsdt(Number(wallet?.availableBalance ?? 0));
    const nextWallet = roundUsdt(available + refund);
    const nextInvest = roundUsdt(liveInvest - refund);

    await this.prisma.$transaction(async (tx) => {
      if (refund > 0) {
        await tx.platformWallet.update({
          where: { userId: row.userId },
          data: {
            availableBalance: nextWallet,
            investorBalance: nextInvest,
          },
        });
        await tx.walletTransaction.create({
          data: {
            userId: row.userId,
            amount: refund,
            type: 'INVESTOR_REDEEM',
            referenceId: `opt_out_${row.id}`,
            description: `Smart Invest opt-out — capital returned $${refund.toFixed(2)} USDT`,
            balanceAfter: nextWallet,
          },
        });
      }
      await tx.user.update({
        where: { id: row.userId },
        data: { investorActive: false },
      });
      await tx.investorSettings.upsert({
        where: { userId: row.userId },
        create: { userId: row.userId, yieldPaused: true, paused: true },
        update: { yieldPaused: true, paused: true },
      });
      await tx.investorOptOut.update({
        where: { id: row.id },
        data: {
          status: InvestorOptOutStatus.SETTLED,
          settledAt: new Date(),
        },
      });
    });

    await this.prisma.platformNotification.create({
      data: {
        userId: row.userId,
        type: 'INVESTOR_OPT_OUT_SETTLED',
        title: 'Smart Invest capital returned',
        body: `$${refund.toFixed(2)} USDT capital is back in your wallet. Smart Invest is closed.`,
        linkUrl: '/wallet',
      },
    });
    this.notifications.investorOptOutSettled(row.userId, {
      refundUsdt: refund,
    });
    this.logger.log(`Settled Smart Invest opt-out ${row.id} refund $${refund}`);
  }

  private async snapshotRemainingInvestorProfits() {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
      select: { investorProfitSnapshotAt: true },
    });
    const coolingIds = (
      await this.prisma.investorOptOut.findMany({
        where: { status: InvestorOptOutStatus.COOLING },
        select: { userId: true },
      })
    ).map((r) => r.userId);
    const investors = await this.prisma.user.findMany({
      where: {
        investorActive: true,
        id: coolingIds.length ? { notIn: coolingIds } : undefined,
      },
      include: { investorSettings: true },
    });
    for (const user of investors) {
      if (
        user.investorSettings?.maintenanceProfitSnapshot != null &&
        config?.investorProfitSnapshotAt
      ) {
        continue;
      }
      const books = await this.snapshotBooks(user.id);
      await this.prisma.investorSettings.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          maintenanceProfitSnapshot: books.profitToDateUsdt,
        },
        update: {
          maintenanceProfitSnapshot:
            user.investorSettings?.maintenanceProfitSnapshot ??
            books.profitToDateUsdt,
        },
      });
    }
    if (!config?.investorProfitSnapshotAt) {
      await this.prisma.platformConfig.update({
        where: { id: 'default' },
        data: { investorProfitSnapshotAt: new Date() },
      });
    }
  }
}
