import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LoanStatus, LoanTerm } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationService } from '../email/notification.service';
import { ComplianceService } from '../compliance/compliance.service';
import {
  isInvestorVipActive,
  resolveInvestorDailyYieldPercent,
} from '../investor/investor-vip.util';
import {
  LOAN_ADVANCE_PERCENT,
  LOAN_INTEREST_PERCENT,
  LOAN_MIN_CORPUS_USDT,
  LOAN_MIN_DAILY_EARNING_USDT,
  LOAN_TERM_DAYS,
  type LoanTermKey,
} from './loan.constants';

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationService,
    private compliance: ComplianceService,
  ) {}

  private parseTerm(raw: string): LoanTerm {
    const t = String(raw ?? '')
      .trim()
      .toUpperCase();
    if (t === 'DAILY' || t === 'WEEKLY' || t === 'MONTHLY') return t as LoanTerm;
    throw new BadRequestException('Term must be DAILY, WEEKLY, or MONTHLY');
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  private serialize(loan: {
    id: string;
    userId: string;
    term: LoanTerm;
    status: LoanStatus;
    dailyEarningEstimate: { toString(): string } | number;
    periodDays: number;
    projectedEarnings: { toString(): string } | number;
    advancePercent: { toString(): string } | number;
    interestPercent: { toString(): string } | number;
    principal: { toString(): string } | number;
    withdrawnAgainstLoan?: { toString(): string } | number;
    interestAmount: { toString(): string } | number;
    totalDue: { toString(): string } | number;
    dueAt: Date | null;
    requestedAt: Date;
    reviewedAt: Date | null;
    approvedAt: Date | null;
    repaidAt: Date | null;
    rejectedReason: string | null;
    adminNote: string | null;
    createdAt: Date;
  }) {
    const principal = Number(loan.principal);
    const withdrawn = Number(loan.withdrawnAgainstLoan ?? 0);
    return {
      id: loan.id,
      userId: loan.userId,
      term: loan.term,
      status: loan.status,
      dailyEarningEstimate: Number(loan.dailyEarningEstimate),
      periodDays: loan.periodDays,
      projectedEarnings: Number(loan.projectedEarnings),
      advancePercent: Number(loan.advancePercent),
      interestPercent: Number(loan.interestPercent),
      principal,
      withdrawnAgainstLoan: withdrawn,
      withdrawableLoanRemaining: Math.max(
        0,
        Math.round((principal - withdrawn) * 100) / 100,
      ),
      interestAmount: Number(loan.interestAmount),
      totalDue: Number(loan.totalDue),
      dueAt: loan.dueAt?.toISOString() ?? null,
      requestedAt: loan.requestedAt.toISOString(),
      reviewedAt: loan.reviewedAt?.toISOString() ?? null,
      approvedAt: loan.approvedAt?.toISOString() ?? null,
      repaidAt: loan.repaidAt?.toISOString() ?? null,
      rejectedReason: loan.rejectedReason,
      adminNote: loan.adminNote,
      createdAt: loan.createdAt.toISOString(),
    };
  }

  async estimateDailyEarning(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        platformWallet: true,
        investorSettings: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
    });
    const platformInvestorYield = Number(
      config?.investorDailyYieldPercent ?? 8,
    );
    const unitrustYield = Number(config?.unitrustDailyYieldPercent ?? 5);

    const investorBalance = Number(user.platformWallet?.investorBalance ?? 0);
    const unitrustBalance = Number(user.platformWallet?.unitrustBalance ?? 0);
    const availableBalance = Number(user.platformWallet?.availableBalance ?? 0);
    const corpus = this.round2(investorBalance + unitrustBalance);

    const investorYield = user.investorActive
      ? resolveInvestorDailyYieldPercent({
          vipActive: isInvestorVipActive(user),
          settingsYieldPercent:
            user.investorSettings?.dailyYieldPercent != null
              ? Number(user.investorSettings.dailyYieldPercent)
              : null,
          platformYieldPercent: platformInvestorYield,
        })
      : 0;

    const investorDaily =
      user.investorActive && investorBalance > 0 && investorYield > 0
        ? this.round2((investorBalance * investorYield) / 100)
        : 0;
    const unitrustDaily =
      user.unitrustActive && unitrustBalance > 0 && unitrustYield > 0
        ? this.round2((unitrustBalance * unitrustYield) / 100)
        : 0;
    const dailyEarning = this.round2(investorDaily + unitrustDaily);

    return {
      corpus,
      availableBalance,
      investorBalance,
      unitrustBalance,
      investorActive: user.investorActive,
      unitrustActive: user.unitrustActive,
      investorYieldPercent: investorYield,
      unitrustYieldPercent: unitrustYield,
      investorDailyEarning: investorDaily,
      unitrustDailyEarning: unitrustDaily,
      dailyEarning,
      eligible:
        corpus >= LOAN_MIN_CORPUS_USDT &&
        dailyEarning >= LOAN_MIN_DAILY_EARNING_USDT,
      minCorpusUsdt: LOAN_MIN_CORPUS_USDT,
      minDailyEarningUsdt: LOAN_MIN_DAILY_EARNING_USDT,
      advancePercent: LOAN_ADVANCE_PERCENT,
      interestPercent: LOAN_INTEREST_PERCENT,
    };
  }

  async quote(userId: string, termRaw: string) {
    const term = this.parseTerm(termRaw);
    const est = await this.estimateDailyEarning(userId);
    const periodDays = LOAN_TERM_DAYS[term as LoanTermKey];
    const projectedEarnings = this.round2(est.dailyEarning * periodDays);
    const principal = this.round2(
      (projectedEarnings * LOAN_ADVANCE_PERCENT) / 100,
    );
    const interestAmount = this.round2(
      (principal * LOAN_INTEREST_PERCENT) / 100,
    );
    const totalDue = this.round2(principal + interestAmount);
    const dueAt = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);

    return {
      term,
      periodDays,
      ...est,
      projectedEarnings,
      principal,
      interestAmount,
      totalDue,
      dueAt: dueAt.toISOString(),
      explanation: `Projected ${periodDays}d earnings $${projectedEarnings.toFixed(2)} → ${LOAN_ADVANCE_PERCENT}% advance $${principal.toFixed(2)} + ${LOAN_INTEREST_PERCENT}% interest $${interestAmount.toFixed(2)} = repay $${totalDue.toFixed(2)}`,
    };
  }

  async listMine(userId: string) {
    const rows = await this.prisma.loan.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.serialize(r));
  }

  async request(userId: string, termRaw: string) {
    await this.compliance.requireKycForPayout(userId);

    const quote = await this.quote(userId, termRaw);
    if (!quote.eligible) {
      throw new BadRequestException(
        `Need at least $${LOAN_MIN_CORPUS_USDT} invested (Smart Invest + Unitrust) and ~$${LOAN_MIN_DAILY_EARNING_USDT}/day projected earnings to request a loan`,
      );
    }
    if (quote.principal < 1) {
      throw new BadRequestException('Projected loan amount is too small');
    }

    const blocking = await this.prisma.loan.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });
    if (blocking) {
      throw new BadRequestException(
        blocking.status === 'PENDING'
          ? 'You already have a loan pending approval'
          : 'Repay your open loan before requesting another',
      );
    }

    const loan = await this.prisma.loan.create({
      data: {
        userId,
        term: quote.term,
        status: 'PENDING',
        dailyEarningEstimate: quote.dailyEarning,
        periodDays: quote.periodDays,
        projectedEarnings: quote.projectedEarnings,
        advancePercent: LOAN_ADVANCE_PERCENT,
        interestPercent: LOAN_INTEREST_PERCENT,
        principal: quote.principal,
        interestAmount: quote.interestAmount,
        totalDue: quote.totalDue,
        dueAt: new Date(quote.dueAt),
        quoteSnapshot: {
          investorBalance: quote.investorBalance,
          unitrustBalance: quote.unitrustBalance,
          investorYieldPercent: quote.investorYieldPercent,
          unitrustYieldPercent: quote.unitrustYieldPercent,
          investorDailyEarning: quote.investorDailyEarning,
          unitrustDailyEarning: quote.unitrustDailyEarning,
        },
      },
    });

    this.notifications.loanRequested(userId, {
      loanId: loan.id,
      term: loan.term,
      principal: Number(loan.principal),
      interestAmount: Number(loan.interestAmount),
      totalDue: Number(loan.totalDue),
      projectedEarnings: Number(loan.projectedEarnings),
      dueAt: loan.dueAt?.toISOString() ?? null,
    });

    return this.serialize(loan);
  }

  async cancel(userId: string, loanId: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, userId },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== 'PENDING') {
      throw new BadRequestException('Only pending loans can be cancelled');
    }
    const updated = await this.prisma.loan.update({
      where: { id: loanId },
      data: { status: 'CANCELLED', reviewedAt: new Date() },
    });
    this.notifications.loanCancelled(userId, {
      loanId,
      term: loan.term,
      principal: Number(loan.principal),
    });
    return this.serialize(updated);
  }

  async repay(userId: string, loanId: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, userId },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== 'APPROVED') {
      throw new BadRequestException('Only an approved open loan can be repaid');
    }

    const totalDue = Number(loan.totalDue);
    const wallet = await this.wallet.getOrCreateWallet(userId);
    const available = Number(wallet.availableBalance);
    if (available < totalDue) {
      throw new BadRequestException(
        `Need $${totalDue.toFixed(2)} USDT in wallet to repay (have $${available.toFixed(2)})`,
      );
    }

    await this.wallet.debitBalance(
      userId,
      totalDue,
      'LOAN_REPAY',
      `Loan repayment ${loan.term} — principal $${Number(loan.principal).toFixed(2)} + interest $${Number(loan.interestAmount).toFixed(2)}`,
      loan.id,
    );

    const updated = await this.prisma.loan.update({
      where: { id: loanId },
      data: { status: 'REPAID', repaidAt: new Date() },
    });

    const bal = await this.wallet.getOrCreateWallet(userId);
    this.notifications.loanRepaid(userId, {
      loanId,
      term: loan.term,
      totalDue,
      balance: Number(bal.availableBalance),
    });

    return this.serialize(updated);
  }

  async listAdmin(status?: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const where =
      status && status !== 'ALL'
        ? { status: status as LoanStatus }
        : { status: { in: ['PENDING', 'APPROVED'] as LoanStatus[] } };
    const rows = await this.prisma.loan.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    return rows.map((r) => ({
      ...this.serialize(r),
      user: r.user,
    }));
  }

  async approve(loanId: string, adminId: string, adminNote?: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== 'PENDING') {
      throw new BadRequestException('Only pending loans can be approved');
    }

    const principal = Number(loan.principal);
    await this.wallet.creditBalance(
      loan.userId,
      principal,
      'LOAN_DISBURSE',
      `Loan disbursed (${loan.term}) — $${principal.toFixed(2)} USDT advance; repay $${Number(loan.totalDue).toFixed(2)}`,
      loan.id,
    );

    const now = new Date();
    const updated = await this.prisma.loan.update({
      where: { id: loanId },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        reviewedAt: now,
        reviewedById: adminId,
        adminNote: adminNote?.trim() || null,
        dueAt:
          loan.dueAt ??
          new Date(now.getTime() + loan.periodDays * 24 * 60 * 60 * 1000),
      },
    });

    // Open loans cannot compound — turn off auto-reinvest immediately.
    await this.prisma.investorSettings.updateMany({
      where: { userId: loan.userId, autoReinvestEarnings: true },
      data: { autoReinvestEarnings: false },
    });

    const bal = await this.wallet.getOrCreateWallet(loan.userId);
    this.notifications.loanApproved(loan.userId, {
      loanId,
      term: loan.term,
      principal,
      interestAmount: Number(loan.interestAmount),
      totalDue: Number(loan.totalDue),
      dueAt: updated.dueAt?.toISOString() ?? null,
      balance: Number(bal.availableBalance),
    });

    return this.serialize(updated);
  }

  async reject(loanId: string, adminId: string, reason?: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== 'PENDING') {
      throw new BadRequestException('Only pending loans can be rejected');
    }
    const updated = await this.prisma.loan.update({
      where: { id: loanId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: adminId,
        rejectedReason: reason?.trim() || 'Rejected by admin',
      },
    });
    this.notifications.loanRejected(loan.userId, {
      loanId,
      term: loan.term,
      principal: Number(loan.principal),
      reason: updated.rejectedReason ?? 'Rejected',
    });
    return this.serialize(updated);
  }

  async markDefaulted(loanId: string, adminId: string, note?: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== 'APPROVED') {
      throw new BadRequestException('Only approved loans can be marked defaulted');
    }
    const updated = await this.prisma.loan.update({
      where: { id: loanId },
      data: {
        status: 'DEFAULTED',
        reviewedAt: new Date(),
        reviewedById: adminId,
        adminNote: note?.trim() || loan.adminNote,
      },
    });
    this.notifications.loanDefaulted(loan.userId, {
      loanId,
      term: loan.term,
      totalDue: Number(loan.totalDue),
    });
    return this.serialize(updated);
  }

  /**
   * Strip post-approval investment/unitrust compounding for users with open loans:
   * net wallet→investment allocates since approval, plus leftover wallet earnings,
   * and force auto-reinvest off.
   */
  async clawbackApprovedLoanReinvestGains() {
    const loans = await this.prisma.loan.findMany({
      where: { status: 'APPROVED' },
      orderBy: { approvedAt: 'asc' },
    });

    const results: Array<{
      userId: string;
      loanId: string;
      email: string | null;
      netReinvested: number;
      autoReinvestFeeClawback: number;
      investmentBefore: number;
      investmentAfter: number;
      availableBefore: number;
      availableAfter: number;
      unitrustBefore: number;
      unitrustAfter: number;
    }> = [];

    for (const loan of loans) {
      const since = loan.approvedAt ?? loan.reviewedAt ?? loan.createdAt;
      const user = await this.prisma.user.findUnique({
        where: { id: loan.userId },
        select: {
          email: true,
          platformWallet: true,
          investorSettings: { select: { autoReinvestEarnings: true } },
        },
      });
      if (!user?.platformWallet) continue;

      const [allocateAgg, redeemAgg, unitrustAllocAgg, unitrustRedeemAgg, reinvestFeeAgg] =
        await Promise.all([
          this.prisma.walletTransaction.aggregate({
            where: {
              userId: loan.userId,
              type: 'INVESTOR_ALLOCATE',
              createdAt: { gte: since },
            },
            _sum: { amount: true },
          }),
          this.prisma.walletTransaction.aggregate({
            where: {
              userId: loan.userId,
              type: 'INVESTOR_REDEEM',
              createdAt: { gte: since },
            },
            _sum: { amount: true },
          }),
          this.prisma.walletTransaction.aggregate({
            where: {
              userId: loan.userId,
              type: 'UNITRUST_ALLOCATE',
              createdAt: { gte: since },
            },
            _sum: { amount: true },
          }),
          this.prisma.walletTransaction.aggregate({
            where: {
              userId: loan.userId,
              type: 'UNITRUST_REDEEM',
              createdAt: { gte: since },
            },
            _sum: { amount: true },
          }),
          this.prisma.walletTransaction.aggregate({
            where: {
              userId: loan.userId,
              type: 'INVESTOR_REINVEST_FEE',
              createdAt: { gte: since },
            },
            _sum: { amount: true },
          }),
        ]);

      // ALLOCATE amounts are negative; REDEEM positive.
      const allocated = Math.abs(Number(allocateAgg._sum.amount ?? 0));
      const redeemed = Math.abs(Number(redeemAgg._sum.amount ?? 0));
      const netInvestorReinvested = this.round2(Math.max(0, allocated - redeemed));

      const unitrustAllocated = Math.abs(Number(unitrustAllocAgg._sum.amount ?? 0));
      const unitrustRedeemed = Math.abs(Number(unitrustRedeemAgg._sum.amount ?? 0));
      const netUnitrustReinvested = this.round2(
        Math.max(0, unitrustAllocated - unitrustRedeemed),
      );

      // Auto-reinvest compounds into investment without a separate ALLOCATE row —
      // earnings rows are positive; fee rows negative. Net compound ≈ earnings
      // that say auto-reinvested. Approximate via fee: fee is 10% of earning, so
      // compounded = fee / 0.1 * 0.9 = fee * 9 when fee was taken.
      const reinvestFees = Math.abs(Number(reinvestFeeAgg._sum.amount ?? 0));
      const autoCompounded = this.round2(reinvestFees * 9);

      const investmentBefore = Number(user.platformWallet.investorBalance ?? 0);
      const availableBefore = Number(user.platformWallet.availableBalance ?? 0);
      const unitrustBefore = Number(user.platformWallet.unitrustBalance ?? 0);

      const stripInvestment = this.round2(
        Math.min(investmentBefore, netInvestorReinvested + autoCompounded),
      );
      const stripUnitrust = this.round2(
        Math.min(unitrustBefore, netUnitrustReinvested),
      );
      // Leave wallet available alone — loan withdraw rules already gate it.
      // Block further wallet→investment / auto-reinvest instead.
      const stripAvailable = 0;

      const investmentAfter = this.round2(investmentBefore - stripInvestment);
      const unitrustAfter = this.round2(unitrustBefore - stripUnitrust);
      const availableAfter = availableBefore;

      if (
        stripInvestment > 0 ||
        stripUnitrust > 0 ||
        stripAvailable > 0 ||
        user.investorSettings?.autoReinvestEarnings
      ) {
        await this.prisma.$transaction([
          this.prisma.platformWallet.update({
            where: { userId: loan.userId },
            data: {
              investorBalance: investmentAfter,
              unitrustBalance: unitrustAfter,
              availableBalance: availableAfter,
            },
          }),
          this.prisma.investorSettings.updateMany({
            where: { userId: loan.userId },
            data: { autoReinvestEarnings: false },
          }),
          ...(stripInvestment + stripUnitrust + stripAvailable > 0
            ? [
                this.prisma.walletTransaction.create({
                  data: {
                    userId: loan.userId,
                    amount: -(stripInvestment + stripUnitrust + stripAvailable),
                    type: 'ADJUSTMENT',
                    referenceId: loan.id,
                    description: `Loan policy: removed post-loan reinvest/earnings (invest −$${stripInvestment.toFixed(2)}, unitrust −$${stripUnitrust.toFixed(2)}, wallet −$${stripAvailable.toFixed(2)})`,
                    balanceAfter: availableAfter,
                  },
                }),
              ]
            : []),
        ]);
      }

      results.push({
        userId: loan.userId,
        loanId: loan.id,
        email: user.email,
        netReinvested: this.round2(
          netInvestorReinvested + autoCompounded + netUnitrustReinvested,
        ),
        autoReinvestFeeClawback: reinvestFees,
        investmentBefore,
        investmentAfter,
        availableBefore,
        availableAfter,
        unitrustBefore,
        unitrustAfter,
      });
    }

    this.logger.log(
      `Loan reinvest clawback: ${results.length} open loan(s) processed`,
    );
    return { count: results.length, results };
  }
}
