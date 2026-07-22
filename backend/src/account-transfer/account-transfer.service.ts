import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma, RankTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../email/notification.service';
import {
  ACCOUNT_TRANSFER_AGREEMENT_VERSION,
  ACCOUNT_TRANSFER_REVIEW_MS,
  ACCOUNT_TRANSFER_TOKEN_TTL_MS,
  type AccountTransferSnapshot,
} from './account-transfer.types';

const OPEN_STATUSES = ['PENDING_USER', 'IN_REVIEW'] as const;

const TIER_RANK: Record<RankTier, number> = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  DIAMOND: 4,
  ELITE: 5,
};

function maskEmail(email: string | null | undefined): string {
  if (!email?.includes('@')) return 'hidden';
  const [local, domain] = email.split('@');
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}***@${domain}`;
}

function num(v: Prisma.Decimal | number | null | undefined): number {
  return Number(v ?? 0);
}

@Injectable()
export class AccountTransferService {
  private readonly logger = new Logger(AccountTransferService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async resolveUser(input: { userId?: string; email?: string }) {
    const email = input.email?.trim().toLowerCase();
    const user = input.userId
      ? await this.prisma.user.findUnique({
          where: { id: input.userId },
          include: {
            platformWallet: true,
            virtualAccount: true,
            kyc: true,
            investorSettings: true,
            profile: true,
          },
        })
      : email
        ? await this.prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            include: {
              platformWallet: true,
              virtualAccount: true,
              kyc: true,
              investorSettings: true,
              profile: true,
            },
          })
        : null;
    if (!user) {
      throw new NotFoundException(
        'User not found — provide a valid userId or email',
      );
    }
    return user;
  }

  private serialize(row: {
    id: string;
    fromUserId: string;
    toUserId: string;
    adminId: string;
    status: string;
    expiresAt: Date;
    userAgreedAt: Date | null;
    reviewStartedAt: Date | null;
    finalizeAfter: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    adminNote: string | null;
    agreementVersion: string;
    failureReason: string | null;
    snapshot: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    fromUser?: { email: string | null; displayName: string; status: string };
    toUser?: { email: string | null; displayName: string; status: string };
  }) {
    const snapshot = (row.snapshot ?? null) as AccountTransferSnapshot | null;
    return {
      id: row.id,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      adminId: row.adminId,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      userAgreedAt: row.userAgreedAt?.toISOString() ?? null,
      reviewStartedAt: row.reviewStartedAt?.toISOString() ?? null,
      finalizeAfter: row.finalizeAfter?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      adminNote: row.adminNote,
      agreementVersion: row.agreementVersion,
      failureReason: row.failureReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      fromUser: row.fromUser
        ? {
            email: row.fromUser.email,
            displayName: row.fromUser.displayName,
            status: row.fromUser.status,
          }
        : undefined,
      toUser: row.toUser
        ? {
            email: row.toUser.email,
            displayName: row.toUser.displayName,
            status: row.toUser.status,
          }
        : undefined,
      snapshot,
    };
  }

  async adminList(take = 50, skip = 0, status?: string) {
    const where = status
      ? { status: status as 'PENDING_USER' | 'IN_REVIEW' | 'COMPLETED' | 'CANCELLED' | 'FAILED' }
      : {};
    const [items, count] = await Promise.all([
      this.prisma.accountTransfer.findMany({
        where,
        include: {
          fromUser: { select: { email: true, displayName: true, status: true } },
          toUser: { select: { email: true, displayName: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(take, 1), 100),
        skip: Math.max(skip, 0),
      }),
      this.prisma.accountTransfer.count({ where }),
    ]);
    return {
      items: items.map((row) => this.serialize(row)),
      count,
      limit: take,
      offset: skip,
    };
  }

  async adminGet(id: string) {
    const row = await this.prisma.accountTransfer.findUnique({
      where: { id },
      include: {
        fromUser: { select: { email: true, displayName: true, status: true } },
        toUser: { select: { email: true, displayName: true, status: true } },
      },
    });
    if (!row) throw new NotFoundException('Transfer not found');
    return this.serialize(row);
  }

  async adminCreate(
    adminId: string,
    input: {
      fromUserId?: string;
      fromEmail?: string;
      toUserId?: string;
      toEmail?: string;
      note?: string;
    },
  ) {
    const fromUser = await this.resolveUser({
      userId: input.fromUserId,
      email: input.fromEmail,
    });
    const toUser = await this.resolveUser({
      userId: input.toUserId,
      email: input.toEmail,
    });

    if (fromUser.id === toUser.id) {
      throw new BadRequestException('Source and destination must be different accounts');
    }
    if (fromUser.role === 'ADMIN' || toUser.role === 'ADMIN') {
      throw new BadRequestException('Admin accounts cannot be used in transfers');
    }
    if (fromUser.status === 'BANNED') {
      throw new BadRequestException('Source account is already banned');
    }
    if (toUser.status === 'BANNED') {
      throw new BadRequestException('Destination account is banned');
    }
    if (!toUser.email?.trim()) {
      throw new BadRequestException('Destination account must have an email');
    }

    const open = await this.prisma.accountTransfer.findFirst({
      where: {
        status: { in: [...OPEN_STATUSES] },
        OR: [
          { fromUserId: fromUser.id },
          { toUserId: fromUser.id },
          { fromUserId: toUser.id },
          { toUserId: toUser.id },
        ],
      },
    });
    if (open) {
      throw new BadRequestException(
        `An open transfer already exists (${open.id}, ${open.status})`,
      );
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + ACCOUNT_TRANSFER_TOKEN_TTL_MS);

    const row = await this.prisma.accountTransfer.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        adminId,
        status: 'PENDING_USER',
        tokenHash,
        expiresAt,
        adminNote: input.note?.trim() || null,
        agreementVersion: ACCOUNT_TRANSFER_AGREEMENT_VERSION,
      },
      include: {
        fromUser: { select: { email: true, displayName: true, status: true } },
        toUser: { select: { email: true, displayName: true, status: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'ACCOUNT_TRANSFER_CREATED',
        targetId: row.id,
        metadata: {
          fromUserId: fromUser.id,
          toUserId: toUser.id,
          fromEmail: fromUser.email,
          toEmail: toUser.email,
        },
      },
    });

    const wallet = fromUser.platformWallet;
    const emailed = await this.notifications.accountTransferRequest(toUser.id, {
      transferId: row.id,
      token,
      fromEmail: fromUser.email,
      fromDisplayName: fromUser.displayName,
      availableBalance: num(wallet?.availableBalance),
      lockedBalance: num(wallet?.lockedBalance),
      investorBalance: num(wallet?.investorBalance),
      expiresAt,
    });

    if (!emailed) {
      await this.prisma.accountTransfer.update({
        where: { id: row.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      throw new BadRequestException(
        'Could not email the destination user — transfer cancelled. Check Resend.',
      );
    }

    return this.serialize(row);
  }

  async getByToken(token: string) {
    const tokenHash = this.hashToken(token.trim());
    const row = await this.prisma.accountTransfer.findUnique({
      where: { tokenHash },
      include: {
        fromUser: {
          select: {
            email: true,
            displayName: true,
            status: true,
            platformWallet: true,
          },
        },
        toUser: { select: { email: true, displayName: true, status: true } },
      },
    });
    if (!row) throw new NotFoundException('Transfer link is invalid');

    const wallet = row.fromUser.platformWallet;
    return {
      id: row.id,
      status: row.status,
      agreementVersion: row.agreementVersion,
      expiresAt: row.expiresAt.toISOString(),
      finalizeAfter: row.finalizeAfter?.toISOString() ?? null,
      fromDisplayName: row.fromUser.displayName,
      fromEmailMasked: maskEmail(row.fromUser.email),
      toDisplayName: row.toUser.displayName,
      toEmailMasked: maskEmail(row.toUser.email),
      availableBalance: num(wallet?.availableBalance),
      lockedBalance: num(wallet?.lockedBalance),
      investorBalance: num(wallet?.investorBalance),
      expired: row.expiresAt.getTime() < Date.now(),
      canAgree: row.status === 'PENDING_USER' && row.expiresAt.getTime() >= Date.now(),
    };
  }

  private buildSnapshot(
    fromUser: Awaited<ReturnType<AccountTransferService['resolveUser']>>,
  ): AccountTransferSnapshot {
    const w = fromUser.platformWallet;
    const v = fromUser.virtualAccount;
    return {
      availableBalance: num(w?.availableBalance),
      lockedBalance: num(w?.lockedBalance),
      investorBalance: num(w?.investorBalance),
      virtualBalance: num(v?.balance),
      virtualScore: v?.score ?? 0,
      virtualTier: v?.tier ?? 'BRONZE',
      virtualTotalTrades: v?.totalTrades ?? 0,
      virtualWinningTrades: v?.winningTrades ?? 0,
      virtualLosingTrades: v?.losingTrades ?? 0,
      virtualWeeklyProfit: num(v?.weeklyProfit),
      virtualTotalProfit: num(v?.totalProfit),
      virtualProfitShareBalance: num(v?.profitShareBalance),
      virtualProfitShareEarned: num(v?.profitShareEarned),
      virtualWinRate: num(v?.winRate),
      virtualConsecutiveWins: v?.consecutiveWins ?? 0,
      virtualConsecutiveLosses: v?.consecutiveLosses ?? 0,
      virtualMaxDrawdown: num(v?.maxDrawdown),
      virtualCurrentDrawdown: num(v?.currentDrawdown),
      registrationPaid: fromUser.registrationPaid,
      accessExpiresAt: fromUser.accessExpiresAt?.toISOString() ?? null,
      profitShareActive: fromUser.profitShareActive,
      profitShareEnrolledAt: fromUser.profitShareEnrolledAt?.toISOString() ?? null,
      investorActive: fromUser.investorActive,
      investorEnrolledAt: fromUser.investorEnrolledAt?.toISOString() ?? null,
      investorVipActive: fromUser.investorVipActive,
      investorVipExpiresAt: fromUser.investorVipExpiresAt?.toISOString() ?? null,
      depositorActive: fromUser.depositorActive,
      mt5SyncActive: fromUser.mt5SyncActive,
      mt5SyncEnrolledAt: fromUser.mt5SyncEnrolledAt?.toISOString() ?? null,
      mt5SyncExpiresAt: fromUser.mt5SyncExpiresAt?.toISOString() ?? null,
      mt5SyncEnabled: fromUser.mt5SyncEnabled,
      metaApiAccountId: fromUser.metaApiAccountId,
      fromEmail: fromUser.email,
      fromDisplayName: fromUser.displayName,
    };
  }

  async userAgree(token: string) {
    const tokenHash = this.hashToken(token.trim());
    const row = await this.prisma.accountTransfer.findUnique({
      where: { tokenHash },
    });
    if (!row) throw new NotFoundException('Transfer link is invalid');
    if (row.status !== 'PENDING_USER') {
      throw new BadRequestException(`Transfer is already ${row.status}`);
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This agreement link has expired — ask admin to create a new transfer');
    }

    const fromUser = await this.resolveUser({ userId: row.fromUserId });
    const toUser = await this.resolveUser({ userId: row.toUserId });
    if (toUser.status === 'BANNED') {
      throw new BadRequestException('Destination account is banned');
    }

    const snapshot = this.buildSnapshot(fromUser);
    const now = new Date();
    const finalizeAfter = new Date(now.getTime() + ACCOUNT_TRANSFER_REVIEW_MS);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: fromUser.id },
        data: { status: 'SUSPENDED' },
      });
      await tx.loginOtp.updateMany({
        where: { userId: fromUser.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.passwordReset.updateMany({
        where: { userId: fromUser.id, usedAt: null },
        data: { usedAt: now },
      });

      return tx.accountTransfer.update({
        where: { id: row.id },
        data: {
          status: 'IN_REVIEW',
          userAgreedAt: now,
          reviewStartedAt: now,
          finalizeAfter,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
        include: {
          fromUser: { select: { email: true, displayName: true, status: true } },
          toUser: { select: { email: true, displayName: true, status: true } },
        },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        adminId: row.adminId,
        action: 'ACCOUNT_TRANSFER_AGREED',
        targetId: row.id,
        metadata: { toUserId: row.toUserId, finalizeAfter: finalizeAfter.toISOString() },
      },
    });

    this.notifications.accountTransferInReview(row.toUserId, {
      transferId: row.id,
      finalizeAfter,
      fromEmail: fromUser.email,
    });

    return this.serialize(updated);
  }

  async adminCancel(adminId: string, transferId: string) {
    const row = await this.prisma.accountTransfer.findUnique({
      where: { id: transferId },
    });
    if (!row) throw new NotFoundException('Transfer not found');
    if (row.status !== 'PENDING_USER') {
      throw new BadRequestException(
        'Only transfers awaiting user agreement can be cancelled',
      );
    }

    const updated = await this.prisma.accountTransfer.update({
      where: { id: transferId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: {
        fromUser: { select: { email: true, displayName: true, status: true } },
        toUser: { select: { email: true, displayName: true, status: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'ACCOUNT_TRANSFER_CANCELLED',
        targetId: transferId,
      },
    });

    this.notifications.accountTransferCancelled(row.toUserId, {
      transferId,
    });

    return this.serialize(updated);
  }

  async finalizeDue() {
    const due = await this.prisma.accountTransfer.findMany({
      where: {
        status: 'IN_REVIEW',
        finalizeAfter: { lte: new Date() },
      },
      orderBy: { finalizeAfter: 'asc' },
      take: 20,
    });

    let completed = 0;
    let failed = 0;
    for (const row of due) {
      try {
        await this.finalize(row.id, { adminId: row.adminId, forced: false });
        completed++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Finalize ${row.id} failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { processed: due.length, completed, failed };
  }

  async finalize(
    transferId: string,
    opts: { adminId: string; forced?: boolean },
  ) {
    const row = await this.prisma.accountTransfer.findUnique({
      where: { id: transferId },
    });
    if (!row) throw new NotFoundException('Transfer not found');
    if (row.status === 'COMPLETED') {
      return this.adminGet(transferId);
    }
    if (row.status !== 'IN_REVIEW') {
      throw new BadRequestException(`Cannot finalize transfer in status ${row.status}`);
    }
    if (
      !opts.forced &&
      row.finalizeAfter &&
      row.finalizeAfter.getTime() > Date.now()
    ) {
      throw new BadRequestException(
        `Review hold until ${row.finalizeAfter.toISOString()}`,
      );
    }

    const snapshot = row.snapshot as AccountTransferSnapshot | null;
    if (!snapshot) {
      throw new BadRequestException('Transfer snapshot missing');
    }

    try {
      await this.applyTransfer(row.id, row.fromUserId, row.toUserId, snapshot);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.prisma.accountTransfer.update({
        where: { id: transferId },
        data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
      });
      void this.notifications.adminSystemAlert('Account transfer FAILED', [
        `Transfer ${transferId} failed during finalize.`,
        `From ${row.fromUserId} → ${row.toUserId}`,
        reason,
      ]);
      throw err;
    }

    const updated = await this.prisma.accountTransfer.update({
      where: { id: transferId },
      data: { status: 'COMPLETED', completedAt: new Date() },
      include: {
        fromUser: { select: { email: true, displayName: true, status: true } },
        toUser: { select: { email: true, displayName: true, status: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        adminId: opts.adminId,
        action: 'ACCOUNT_TRANSFER_COMPLETED',
        targetId: transferId,
        metadata: {
          fromUserId: row.fromUserId,
          toUserId: row.toUserId,
          forced: Boolean(opts.forced),
        },
      },
    });

    this.notifications.accountTransferCompleted(row.toUserId, {
      transferId,
      fromEmail: snapshot.fromEmail,
      availableBalance: snapshot.availableBalance,
      lockedBalance: snapshot.lockedBalance,
      investorBalance: snapshot.investorBalance,
    });

    return this.serialize(updated);
  }

  private async applyTransfer(
    transferId: string,
    fromUserId: string,
    toUserId: string,
    snapshot: AccountTransferSnapshot,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const fromWallet = await tx.platformWallet.findUnique({
        where: { userId: fromUserId },
      });
      const toWallet = await tx.platformWallet.upsert({
        where: { userId: toUserId },
        create: { userId: toUserId },
        update: {},
      });

      const addAvail = num(fromWallet?.availableBalance);
      const addLocked = num(fromWallet?.lockedBalance);
      const addInvestor = num(fromWallet?.investorBalance);
      const nextAvail = num(toWallet.availableBalance) + addAvail;
      const nextLocked = num(toWallet.lockedBalance) + addLocked;
      const nextInvestor = num(toWallet.investorBalance) + addInvestor;

      await tx.platformWallet.update({
        where: { userId: toUserId },
        data: {
          availableBalance: nextAvail,
          lockedBalance: nextLocked,
          investorBalance: nextInvestor,
        },
      });

      if (fromWallet) {
        await tx.platformWallet.update({
          where: { userId: fromUserId },
          data: {
            availableBalance: 0,
            lockedBalance: 0,
            investorBalance: 0,
          },
        });
      }

      const totalMoved = addAvail + addLocked + addInvestor;
      if (totalMoved > 0) {
        await tx.walletTransaction.create({
          data: {
            userId: toUserId,
            amount: totalMoved,
            type: 'ADJUSTMENT',
            referenceId: transferId,
            description: `Account transfer from ${snapshot.fromEmail ?? fromUserId} — transfer ${transferId}`,
            balanceAfter: nextAvail,
          },
        });
      }

      // Reassign ledger / history
      await tx.walletTransaction.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.payment.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.payout.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.tpClaim.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });

      // Investor trades — unique (signalId, userId)
      const fromTrades = await tx.investorTrade.findMany({
        where: { userId: fromUserId },
      });
      for (const t of fromTrades) {
        const clash = await tx.investorTrade.findUnique({
          where: {
            signalId_userId: { signalId: t.signalId, userId: toUserId },
          },
        });
        if (clash) {
          await tx.investorTrade.delete({ where: { id: t.id } });
        } else {
          await tx.investorTrade.update({
            where: { id: t.id },
            data: { userId: toUserId },
          });
        }
      }

      // Investor daily credits — skip days dest already has
      const fromCredits = await tx.investorDailyCredit.findMany({
        where: { userId: fromUserId },
      });
      for (const c of fromCredits) {
        const clash = await tx.investorDailyCredit.findUnique({
          where: {
            userId_creditDate: { userId: toUserId, creditDate: c.creditDate },
          },
        });
        if (clash) {
          await tx.investorDailyCredit.delete({ where: { id: c.id } });
        } else {
          await tx.investorDailyCredit.update({
            where: { id: c.id },
            data: { userId: toUserId },
          });
        }
      }

      await tx.depositorPlan.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.signal.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.signalDraft.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.tradeScore.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });

      // Rankings — unique per user/week
      const fromRankings = await tx.ranking.findMany({
        where: { userId: fromUserId },
      });
      for (const r of fromRankings) {
        const clash = await tx.ranking.findUnique({
          where: {
            userId_year_weekNumber: {
              userId: toUserId,
              year: r.year,
              weekNumber: r.weekNumber,
            },
          },
        });
        if (clash) {
          await tx.ranking.delete({ where: { id: r.id } });
        } else {
          await tx.ranking.update({
            where: { id: r.id },
            data: { userId: toUserId },
          });
        }
      }

      await tx.subscription.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.evaluationEnrollment.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.mt5SyncLink.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.platformNotification.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });

      // Saved withdrawal wallets (skip collisions)
      const sourceWallets = await tx.savedWithdrawalWallet.findMany({
        where: { userId: fromUserId },
      });
      for (const w of sourceWallets) {
        const clash = await tx.savedWithdrawalWallet.findFirst({
          where: {
            userId: toUserId,
            address: w.address,
            network: w.network,
          },
        });
        if (clash) {
          await tx.savedWithdrawalWallet.delete({ where: { id: w.id } });
        } else {
          await tx.savedWithdrawalWallet.update({
            where: { id: w.id },
            data: { userId: toUserId },
          });
        }
      }

      // KYC
      const fromKyc = await tx.kycVerification.findUnique({
        where: { userId: fromUserId },
      });
      const toKyc = await tx.kycVerification.findUnique({
        where: { userId: toUserId },
      });
      if (fromKyc) {
        const destHasApproved = toKyc?.status === 'APPROVED';
        const sourceUseful =
          fromKyc.status === 'APPROVED' || fromKyc.status === 'PENDING';
        if (!destHasApproved && sourceUseful) {
          if (toKyc) {
            await tx.kycVerification.delete({ where: { userId: toUserId } });
          }
          await tx.kycVerification.update({
            where: { userId: fromUserId },
            data: { userId: toUserId },
          });
        } else {
          await tx.kycVerification.delete({ where: { userId: fromUserId } });
        }
      }

      // Investor settings
      const fromInv = await tx.investorSettings.findUnique({
        where: { userId: fromUserId },
      });
      const toInv = await tx.investorSettings.findUnique({
        where: { userId: toUserId },
      });
      if (fromInv) {
        if (!toInv) {
          await tx.investorSettings.update({
            where: { userId: fromUserId },
            data: { userId: toUserId },
          });
        } else {
          await tx.investorSettings.update({
            where: { userId: toUserId },
            data: {
              riskPercent: fromInv.riskPercent,
              dailyYieldPercent:
                toInv.dailyYieldPercent ?? fromInv.dailyYieldPercent,
              committedInvestmentAmount:
                num(toInv.committedInvestmentAmount) +
                  num(fromInv.committedInvestmentAmount) >
                0
                  ? num(toInv.committedInvestmentAmount) +
                    num(fromInv.committedInvestmentAmount)
                  : null,
              useTwoToOneRr: fromInv.useTwoToOneRr,
            },
          });
          await tx.investorSettings.delete({ where: { userId: fromUserId } });
        }
      }

      // Profile payout fields if dest empty
      const fromProfile = await tx.userProfile.findUnique({
        where: { userId: fromUserId },
      });
      const toProfile = await tx.userProfile.findUnique({
        where: { userId: toUserId },
      });
      if (fromProfile) {
        if (!toProfile) {
          await tx.userProfile.update({
            where: { userId: fromUserId },
            data: { userId: toUserId },
          });
        } else {
          await tx.userProfile.update({
            where: { userId: toUserId },
            data: {
              payoutMethod: toProfile.payoutMethod ?? fromProfile.payoutMethod,
              trc20Address: toProfile.trc20Address ?? fromProfile.trc20Address,
              mobileMoneyProvider:
                toProfile.mobileMoneyProvider ?? fromProfile.mobileMoneyProvider,
              mobileMoneyNumber:
                toProfile.mobileMoneyNumber ?? fromProfile.mobileMoneyNumber,
              mobileMoneyAccountName:
                toProfile.mobileMoneyAccountName ??
                fromProfile.mobileMoneyAccountName,
              country: toProfile.country ?? fromProfile.country,
              firstName: toProfile.firstName ?? fromProfile.firstName,
              lastName: toProfile.lastName ?? fromProfile.lastName,
            },
          });
        }
      }

      // Virtual account merge
      const fromVa = await tx.virtualAccount.findUnique({
        where: { userId: fromUserId },
      });
      const toVa = await tx.virtualAccount.findUnique({
        where: { userId: toUserId },
      });
      if (fromVa) {
        if (!toVa) {
          await tx.virtualAccount.update({
            where: { userId: fromUserId },
            data: { userId: toUserId },
          });
        } else {
          const fromTier = fromVa.tier;
          const toTier = toVa.tier;
          const keepTier =
            TIER_RANK[fromTier] > TIER_RANK[toTier] ? fromTier : toTier;
          await tx.virtualAccount.update({
            where: { userId: toUserId },
            data: {
              balance: Math.max(num(toVa.balance), num(fromVa.balance)),
              tier: keepTier,
              score: Math.max(toVa.score, fromVa.score),
              totalTrades: toVa.totalTrades + fromVa.totalTrades,
              winningTrades: toVa.winningTrades + fromVa.winningTrades,
              losingTrades: toVa.losingTrades + fromVa.losingTrades,
              weeklyProfit: num(toVa.weeklyProfit) + num(fromVa.weeklyProfit),
              totalProfit: num(toVa.totalProfit) + num(fromVa.totalProfit),
              profitShareBalance:
                num(toVa.profitShareBalance) + num(fromVa.profitShareBalance),
              profitShareEarned:
                num(toVa.profitShareEarned) + num(fromVa.profitShareEarned),
              winRate:
                toVa.totalTrades + fromVa.totalTrades > 0
                  ? ((toVa.winningTrades + fromVa.winningTrades) /
                      (toVa.totalTrades + fromVa.totalTrades)) *
                    100
                  : 0,
            },
          });
          await tx.virtualAccount.delete({ where: { userId: fromUserId } });
        }
      }

      const toUser = await tx.user.findUniqueOrThrow({ where: { id: toUserId } });
      const fromUser = await tx.user.findUniqueOrThrow({
        where: { id: fromUserId },
      });

      const destAccess = toUser.accessExpiresAt?.getTime() ?? 0;
      const srcAccess = fromUser.accessExpiresAt?.getTime() ?? 0;
      const betterAccess =
        srcAccess > destAccess ? fromUser.accessExpiresAt : toUser.accessExpiresAt;

      await tx.user.update({
        where: { id: toUserId },
        data: {
          registrationPaid: toUser.registrationPaid || snapshot.registrationPaid,
          accessExpiresAt: betterAccess,
          profitShareActive: toUser.profitShareActive || snapshot.profitShareActive,
          profitShareEnrolledAt:
            toUser.profitShareEnrolledAt ??
            (snapshot.profitShareEnrolledAt
              ? new Date(snapshot.profitShareEnrolledAt)
              : null),
          investorActive: toUser.investorActive || snapshot.investorActive,
          investorEnrolledAt:
            toUser.investorEnrolledAt ??
            (snapshot.investorEnrolledAt
              ? new Date(snapshot.investorEnrolledAt)
              : null),
          investorVipActive: toUser.investorVipActive || snapshot.investorVipActive,
          investorVipExpiresAt: (() => {
            const a = toUser.investorVipExpiresAt?.getTime() ?? 0;
            const b = snapshot.investorVipExpiresAt
              ? new Date(snapshot.investorVipExpiresAt).getTime()
              : 0;
            if (b > a && snapshot.investorVipExpiresAt) {
              return new Date(snapshot.investorVipExpiresAt);
            }
            return toUser.investorVipExpiresAt;
          })(),
          depositorActive: toUser.depositorActive || snapshot.depositorActive,
          mt5SyncActive: toUser.mt5SyncActive || snapshot.mt5SyncActive,
          mt5SyncEnrolledAt:
            toUser.mt5SyncEnrolledAt ??
            (snapshot.mt5SyncEnrolledAt
              ? new Date(snapshot.mt5SyncEnrolledAt)
              : null),
          mt5SyncExpiresAt: (() => {
            const a = toUser.mt5SyncExpiresAt?.getTime() ?? 0;
            const b = snapshot.mt5SyncExpiresAt
              ? new Date(snapshot.mt5SyncExpiresAt).getTime()
              : 0;
            if (b > a && snapshot.mt5SyncExpiresAt) {
              return new Date(snapshot.mt5SyncExpiresAt);
            }
            return toUser.mt5SyncExpiresAt;
          })(),
          metaApiAccountId: toUser.metaApiAccountId ?? snapshot.metaApiAccountId,
          status:
            toUser.status === 'PENDING_VERIFICATION' ||
            toUser.status === 'PENDING_PAYMENT'
              ? snapshot.registrationPaid || toUser.registrationPaid
                ? 'ACTIVE'
                : toUser.status
              : toUser.status,
        },
      });

      await tx.leaderboard.deleteMany({ where: { userId: fromUserId } });
      await tx.user.update({
        where: { id: fromUserId },
        data: {
          status: 'BANNED',
          investorActive: false,
          depositorActive: false,
          mt5SyncActive: false,
          profitShareActive: false,
          investorVipActive: false,
          metaApiAccountId: null,
        },
      });
    });
  }
}
