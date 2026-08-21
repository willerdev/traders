import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  AirfarmingDropSource,
  AirfarmingDropStatus,
  AirfarmingEnrollmentStatus,
  AirfarmingTransferDirection,
  AirfarmingTransferReason,
  Prisma,
  UserStatus,
  WalletTxType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationService } from '../email/notification.service';
import {
  AIRFARMING_SETTINGS_ID,
  CATCHUP_DROP_INDEX,
  DEFAULT_DROP_BANDS,
} from './airfarming.constants';
import { deterministicSeed, pickIntervalHours } from './airfarming-seed.util';
import {
  formatUtcDateKey,
  utcWeekEndExclusive,
  utcWeekStart,
} from './airfarming-week.util';
import { AirfarmingApplyInput } from './airfarming-apply.dto';

type BandRow = {
  bandIndex: number;
  label: string;
  minBalance: Prisma.Decimal | number;
  maxBalance: Prisma.Decimal | number;
  percent: Prisma.Decimal | number;
  active: boolean;
};

type SettingsRow = {
  maxPercent: Prisma.Decimal | number;
  maxProfitPerDrop: Prisma.Decimal | number;
  weeklyYieldFloorRate: Prisma.Decimal | number;
  dropIntervalHours: number[];
  eligibilitySnapshotHours: number;
  floatPrepHours: number;
  platformFeeRate: Prisma.Decimal | number;
  globallyPaused: boolean;
};

@Injectable()
export class AirfarmingService implements OnModuleInit {
  private readonly logger = new Logger(AirfarmingService.name);

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
    private notifications: NotificationService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaults();
  }

  async ensureDefaults() {
    await this.prisma.airfarmingPlatformSettings.upsert({
      where: { id: AIRFARMING_SETTINGS_ID },
      create: { id: AIRFARMING_SETTINGS_ID },
      update: {},
    });
    for (const band of DEFAULT_DROP_BANDS) {
      await this.prisma.airfarmingDropBand.upsert({
        where: { bandIndex: band.bandIndex },
        create: {
          bandIndex: band.bandIndex,
          label: band.label,
          minBalance: band.minBalance,
          maxBalance: band.maxBalance,
          percent: band.percent,
        },
        update: {},
      });
    }
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private num(v: Prisma.Decimal | number | null | undefined): number {
    return Number(v ?? 0);
  }

  private async settings(): Promise<SettingsRow> {
    return this.prisma.airfarmingPlatformSettings.findUniqueOrThrow({
      where: { id: AIRFARMING_SETTINGS_ID },
    });
  }

  private async bands(): Promise<BandRow[]> {
    return this.prisma.airfarmingDropBand.findMany({
      where: { active: true },
      orderBy: { bandIndex: 'asc' },
    });
  }

  private isUserBlocked(status: UserStatus): boolean {
    return status === 'BANNED' || status === 'SUSPENDED';
  }

  private enrollmentView(
    row: {
      status: AirfarmingEnrollmentStatus;
      appliedAt: Date;
      approvedAt: Date | null;
      rejectionReason: string | null;
      fullName?: string;
      email?: string;
      age?: number;
      location?: string;
      plannedInvestmentUsd?: Prisma.Decimal | number;
      withdrawPreference?: string;
    } | null,
  ) {
    if (!row) {
      return {
        status: 'NOT_APPLIED' as const,
        appliedAt: null as string | null,
        approvedAt: null as string | null,
        rejectionReason: null as string | null,
        canApply: true,
        canAllocate: false,
        application: null,
      };
    }
    return {
      status: row.status,
      appliedAt: row.appliedAt.toISOString(),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      canApply: row.status === AirfarmingEnrollmentStatus.REJECTED,
      canAllocate: row.status === AirfarmingEnrollmentStatus.APPROVED,
      application:
        row.fullName != null
          ? {
              fullName: row.fullName,
              email: row.email ?? '',
              age: row.age ?? 0,
              location: row.location ?? '',
              plannedInvestmentUsd: this.num(row.plannedInvestmentUsd),
              withdrawPreference: row.withdrawPreference ?? 'WEEKLY',
            }
          : null,
    };
  }

  private async requireApprovedEnrollment(userId: string) {
    const enrollment = await this.prisma.airfarmingEnrollment.findUnique({
      where: { userId },
    });
    if (!enrollment || enrollment.status !== AirfarmingEnrollmentStatus.APPROVED) {
      throw new BadRequestException(
        'Airfarming enrollment required — apply and wait for approval before allocating funds',
      );
    }
    return enrollment;
  }

  async apply(userId: string, input: AirfarmingApplyInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (this.isUserBlocked(user.status)) {
      throw new BadRequestException('Account cannot apply for Airfarming');
    }

    const existing = await this.prisma.airfarmingEnrollment.findUnique({
      where: { userId },
    });

    if (existing?.status === AirfarmingEnrollmentStatus.APPROVED) {
      throw new BadRequestException('You are already enrolled in Airfarming');
    }
    if (existing?.status === AirfarmingEnrollmentStatus.PENDING) {
      throw new BadRequestException('Your Airfarming application is already pending review');
    }

    const now = new Date();
    const enrollment = await this.prisma.airfarmingEnrollment.upsert({
      where: { userId },
      create: {
        userId,
        status: AirfarmingEnrollmentStatus.PENDING,
        fullName: input.fullName,
        email: input.email,
        age: input.age,
        location: input.location,
        plannedInvestmentUsd: input.plannedInvestmentUsd,
        withdrawPreference: input.withdrawPreference,
        termsAcceptedAt: now,
      },
      update: {
        status: AirfarmingEnrollmentStatus.PENDING,
        appliedAt: now,
        reviewedAt: null,
        reviewedById: null,
        approvedAt: null,
        rejectionReason: null,
        fullName: input.fullName,
        email: input.email,
        age: input.age,
        location: input.location,
        plannedInvestmentUsd: input.plannedInvestmentUsd,
        withdrawPreference: input.withdrawPreference,
        termsAcceptedAt: now,
      },
    });

    this.notifications.airfarmingApplicationSubmitted(userId, {
      fullName: input.fullName,
      email: input.email,
      age: input.age,
      location: input.location,
      plannedInvestmentUsd: input.plannedInvestmentUsd,
      withdrawPreference: input.withdrawPreference,
    });
    this.notifications.airfarmingApplicationSubmittedAdmin(userId, {
      fullName: input.fullName,
      email: input.email,
      age: input.age,
      location: input.location,
      plannedInvestmentUsd: input.plannedInvestmentUsd,
      withdrawPreference: input.withdrawPreference,
    });

    return {
      enrollment: this.enrollmentView(enrollment),
      message:
        'Application submitted. Once approved, you will be emailed about every Airfarming activity — drops, float moves, and weekly progress.',
    };
  }

  async adminListApplications(status?: AirfarmingEnrollmentStatus) {
    return this.prisma.airfarmingEnrollment.findMany({
      where: status ? { status } : undefined,
      orderBy: { appliedAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            status: true,
            airfarmingActive: true,
            platformWallet: { select: { availableBalance: true } },
            airfarmingState: { select: { committedUsd: true } },
          },
        },
      },
    });
  }

  async adminApproveApplication(userId: string, adminId: string) {
    const enrollment = await this.prisma.airfarmingEnrollment.findUnique({
      where: { userId },
    });
    if (!enrollment) throw new NotFoundException('No Airfarming application found');
    if (enrollment.status === AirfarmingEnrollmentStatus.APPROVED) {
      return { enrollment, alreadyApproved: true };
    }
    if (enrollment.status !== AirfarmingEnrollmentStatus.PENDING) {
      throw new BadRequestException('Application is not pending review');
    }

    const updated = await this.prisma.airfarmingEnrollment.update({
      where: { userId },
      data: {
        status: AirfarmingEnrollmentStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedById: adminId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });

    this.notifications.airfarmingApplicationApproved(userId);
    return { enrollment: updated };
  }

  async adminRejectApplication(userId: string, adminId: string, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BadRequestException('Rejection reason is required');
    }

    const enrollment = await this.prisma.airfarmingEnrollment.findUnique({
      where: { userId },
    });
    if (!enrollment) throw new NotFoundException('No Airfarming application found');
    if (enrollment.status !== AirfarmingEnrollmentStatus.PENDING) {
      throw new BadRequestException('Application is not pending review');
    }

    const state = await this.prisma.airfarmingState.findUnique({ where: { userId } });
    const afWallet = await this.prisma.airfarmingWallet.findUnique({ where: { userId } });
    if (this.num(state?.committedUsd) > 0 || this.num(afWallet?.balance) > 0) {
      throw new BadRequestException(
        'Cannot reject — user still has Airfarming commitment. Deallocate first.',
      );
    }

    const updated = await this.prisma.airfarmingEnrollment.update({
      where: { userId },
      data: {
        status: AirfarmingEnrollmentStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedById: adminId,
        approvedAt: null,
        rejectionReason: trimmed,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { airfarmingActive: false },
    });

    this.notifications.airfarmingApplicationRejected(userId, trimmed);
    return { enrollment: updated };
  }

  private async getOrCreateState(userId: string, weekStart = utcWeekStart()) {
    const existing = await this.prisma.airfarmingState.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    return this.prisma.airfarmingState.create({
      data: {
        userId,
        weekStart,
        weekInvestmentUsd: 0,
        weekYieldUsd: 0,
        committedUsd: 0,
      },
    });
  }

  private async getOrCreateAfWallet(userId: string) {
    return this.prisma.airfarmingWallet.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    });
  }

  private pickBand(
    seed: number,
    investment: number,
    bandRows: BandRow[],
  ): BandRow {
    const eligible = bandRows.filter((b) => investment >= this.num(b.minBalance));
    const pool = eligible.length > 0 ? eligible : bandRows;
    return pool[seed % pool.length];
  }

  private computeRange(
    band: BandRow,
    seed: number,
  ): { minBalance: number; maxBalance: number; percent: number } {
    const min = this.num(band.minBalance);
    const max = this.num(band.maxBalance);
    const span = Math.max(1, Math.floor(max - min + 1));
    const offset = seed % span;
    return {
      minBalance: min,
      maxBalance: min + offset,
      percent: this.num(band.percent),
    };
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { platformWallet: true, airfarmingEnrollment: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const enrollment = this.enrollmentView(user.airfarmingEnrollment);
    const cfg = await this.settings();

    if (!enrollment.canAllocate) {
      return {
        active: false,
        enrollment,
        cashWalletUsd: this.num(user.platformWallet?.availableBalance),
        airfarmingWalletUsd: 0,
        committedUsd: 0,
        phase: 'idle',
        globallyPaused: cfg.globallyPaused,
        week: null,
        nextDrop: null,
        history: [],
      };
    }

    const weekStart = utcWeekStart();
    const state = await this.getOrCreateState(userId, weekStart);
    const afWallet = await this.getOrCreateAfWallet(userId);

    if (!isSameWeek(state.weekStart, weekStart)) {
      await this.finalizeWeekForUser(userId, state.weekStart);
      await this.prisma.airfarmingState.update({
        where: { userId },
        data: {
          weekStart,
          weekYieldUsd: 0,
          weekInvestmentUsd: this.num(state.committedUsd),
        },
      });
    }

    const freshState = await this.prisma.airfarmingState.findUniqueOrThrow({
      where: { userId },
    });

    const nextDrop = await this.prisma.airfarmingDrop.findFirst({
      where: {
        userId,
        weekStart: freshState.weekStart,
        status: AirfarmingDropStatus.SCHEDULED,
        dueAt: { gte: new Date() },
      },
      orderBy: { dueAt: 'asc' },
    });

    const history = await this.prisma.airfarmingDrop.findMany({
      where: {
        userId,
        status: { in: [AirfarmingDropStatus.PAID, AirfarmingDropStatus.MISSED] },
      },
      orderBy: { dueAt: 'desc' },
      take: 10,
    });

    const cashWalletUsd = this.num(user.platformWallet?.availableBalance);
    const airfarmingWalletUsd = this.num(afWallet.balance);
    const investmentUsd = this.num(freshState.weekInvestmentUsd);
    const yieldUsd = this.num(freshState.weekYieldUsd);
    const floorRate = this.num(cfg.weeklyYieldFloorRate);
    const floorTargetUsd = this.round2(investmentUsd * floorRate);
    const floorRemainingUsd = Math.max(0, this.round2(floorTargetUsd - yieldUsd));
    const progressPct =
      floorTargetUsd > 0
        ? Math.min(100, Math.round((yieldUsd / floorTargetUsd) * 100))
        : 0;

    const phase = this.resolvePhase(nextDrop, cfg, airfarmingWalletUsd);

    return {
      active: user.airfarmingActive,
      enrollment,
      cashWalletUsd,
      airfarmingWalletUsd,
      committedUsd: this.num(freshState.committedUsd),
      phase,
      globallyPaused: cfg.globallyPaused,
      week: {
        weekStart: formatUtcDateKey(freshState.weekStart),
        investmentUsd,
        yieldUsd,
        floorRate,
        floorTargetUsd,
        floorRemainingUsd,
        progressPct,
      },
      nextDrop: nextDrop
        ? {
            id: nextDrop.id,
            dueAt: nextDrop.dueAt.toISOString(),
            minBalance: this.num(nextDrop.minBalance),
            maxBalance: this.num(nextDrop.maxBalance),
            percent: this.num(nextDrop.percent),
            secondsRemaining: Math.max(
              0,
              Math.ceil((nextDrop.dueAt.getTime() - Date.now()) / 1000),
            ),
          }
        : null,
      history: history.map((d) => ({
        id: d.id,
        dueAt: d.dueAt.toISOString(),
        status: d.status,
        source: d.source,
        profitAmount: d.profitAmount != null ? this.num(d.profitAmount) : null,
        percent: this.num(d.percent),
      })),
    };
  }

  private resolvePhase(
    nextDrop: { dueAt: Date; status: AirfarmingDropStatus } | null,
    cfg: SettingsRow,
    afBalance: number,
  ): string {
    if (!nextDrop) return 'idle';
    const now = Date.now();
    const prepMs = cfg.floatPrepHours * 60 * 60 * 1000;
    const dueMs = nextDrop.dueAt.getTime();
    if (now >= dueMs) return 'processing';
    if (now >= dueMs - prepMs || afBalance > 0) return 'preparing';
    if (dueMs - now <= prepMs * 2) return 'waiting';
    return 'idle';
  }

  async allocate(userId: string, rawAmount: number) {
    const amount = this.round2(Number(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { platformWallet: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (this.isUserBlocked(user.status)) {
      throw new BadRequestException('Account cannot use Airfarming');
    }
    await this.requireApprovedEnrollment(userId);

    const cash = this.num(user.platformWallet?.availableBalance);
    const state = await this.getOrCreateState(userId);
    const committed = this.num(state.committedUsd);
    if (cash < amount) {
      throw new BadRequestException(
        `Insufficient cash — need $${amount.toFixed(2)} but have $${cash.toFixed(2)}`,
      );
    }

    const weekStart = utcWeekStart();
    await this.ensureWeekRolled(userId, state);

    const newCommitted = this.round2(committed + amount);
    const newInvestment = Math.max(this.num(state.weekInvestmentUsd), newCommitted);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        airfarmingActive: true,
        airfarmingEnrolledAt: user.airfarmingEnrolledAt ?? new Date(),
      },
    });

    await this.prisma.airfarmingState.update({
      where: { userId },
      data: {
        weekStart,
        committedUsd: newCommitted,
        weekInvestmentUsd: newInvestment,
      },
    });

    await this.ensureNextDropScheduled(userId);

    return this.getStatus(userId);
  }

  async deallocate(userId: string, rawAmount: number) {
    await this.requireApprovedEnrollment(userId);

    const amount = this.round2(Number(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const state = await this.prisma.airfarmingState.findUnique({
      where: { userId },
    });
    if (!state) throw new BadRequestException('No Airfarming commitment');

    const afWallet = await this.getOrCreateAfWallet(userId);
    if (this.num(afWallet.balance) > 0) {
      throw new BadRequestException(
        'Cannot deallocate while a drop is preparing — wait until funds return to cash',
      );
    }

    const prepDrop = await this.prisma.airfarmingDrop.findFirst({
      where: {
        userId,
        status: AirfarmingDropStatus.SCHEDULED,
        floatPreparedAt: { not: null },
      },
    });
    if (prepDrop) {
      throw new BadRequestException('Cannot deallocate during an active drop window');
    }

    const committed = this.num(state.committedUsd);
    if (amount > committed) {
      throw new BadRequestException(
        `Cannot deallocate more than committed $${committed.toFixed(2)}`,
      );
    }

    const newCommitted = this.round2(committed - amount);
    await this.prisma.airfarmingState.update({
      where: { userId },
      data: { committedUsd: newCommitted },
    });

    if (newCommitted <= 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { airfarmingActive: false },
      });
    }

    return this.getStatus(userId);
  }

  async runMinuteJobs() {
    const cfg = await this.settings();
    if (cfg.globallyPaused) {
      return { settled: 0, floated: 0, skipped: 'paused' as const };
    }

    const activeUsers = await this.prisma.user.findMany({
      where: {
        airfarmingActive: true,
        airfarmingEnrollment: { status: AirfarmingEnrollmentStatus.APPROVED },
        status: { notIn: ['BANNED', 'SUSPENDED'] },
      },
      select: { id: true },
    });

    let settled = 0;
    let floated = 0;

    for (const { id } of activeUsers) {
      try {
        const state = await this.prisma.airfarmingState.findUnique({
          where: { userId: id },
        });
        if (state) {
          await this.ensureWeekRolled(id, state);
        }
        floated += await this.runFloatJobsForUser(id);
        if (await this.settleDueDropsForUser(id)) settled++;
        await this.maybeIdlePark(id);
      } catch (err) {
        this.logger.warn(
          `Airfarming minute job failed for ${id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { settled, floated };
  }

  async runHourlyJobs() {
    const cfg = await this.settings();
    if (cfg.globallyPaused) return { scheduled: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        airfarmingActive: true,
        airfarmingEnrollment: { status: AirfarmingEnrollmentStatus.APPROVED },
        status: { notIn: ['BANNED', 'SUSPENDED'] },
      },
      select: { id: true },
    });

    let scheduled = 0;
    for (const { id } of users) {
      if (await this.ensureNextDropScheduled(id)) scheduled++;
    }
    return { scheduled };
  }

  private async ensureWeekRolled(
    userId: string,
    state: {
      weekStart: Date;
      weekInvestmentUsd: Prisma.Decimal | number;
      committedUsd: Prisma.Decimal | number;
    },
  ) {
    const currentWeek = utcWeekStart();
    if (isSameWeek(state.weekStart, currentWeek)) return;

    await this.finalizeWeekForUser(userId, state.weekStart);
    await this.prisma.airfarmingState.update({
      where: { userId },
      data: {
        weekStart: currentWeek,
        weekYieldUsd: 0,
        weekInvestmentUsd: this.num(state.committedUsd),
      },
    });
    await this.ensureNextDropScheduled(userId);
  }

  private async finalizeWeekForUser(userId: string, weekStart: Date) {
    await this.applyWeekFloorCatchUp(userId, weekStart);
    await this.returnAllAfToCash(userId, AirfarmingTransferReason.SYSTEM, null);
  }

  private async applyWeekFloorCatchUp(userId: string, weekStart: Date) {
    const cfg = await this.settings();
    const state = await this.prisma.airfarmingState.findUnique({
      where: { userId },
    });
    if (!state) return;

    const existing = await this.prisma.airfarmingDrop.findUnique({
      where: {
        userId_weekStart_dropIndex: {
          userId,
          weekStart,
          dropIndex: CATCHUP_DROP_INDEX,
        },
      },
    });
    if (existing) return;

    const investment = this.num(state.weekInvestmentUsd);
    if (investment <= 0) return;

    const floorRate = this.num(cfg.weeklyYieldFloorRate);
    const needed = this.round2(investment * floorRate);
    const yieldUsd = this.num(state.weekYieldUsd);
    const shortfall = this.round2(needed - yieldUsd);
    if (shortfall <= 0) return;

    const feeRate = this.num(cfg.platformFeeRate);
    const gross = this.round2(shortfall / Math.max(0.0001, 1 - feeRate));
    const fee = this.round2(gross - shortfall);
    const net = shortfall;

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.platformWallet.upsert({
        where: { userId },
        create: { userId, availableBalance: net },
        update: { availableBalance: { increment: net } },
      });

      await tx.airfarmingDrop.create({
        data: {
          userId,
          weekStart,
          dropIndex: CATCHUP_DROP_INDEX,
          dueAt: utcWeekEndInclusive(weekStart),
          percent: 0,
          minBalance: 0,
          maxBalance: 0,
          bandIndex: -1,
          status: AirfarmingDropStatus.PAID,
          source: AirfarmingDropSource.WEEK_FLOOR_CATCHUP,
          eligibleBalance: investment,
          profitAmount: net,
          paidAt: new Date(),
        },
      });

      await tx.airfarmingState.update({
        where: { userId },
        data: { weekYieldUsd: { increment: net } },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          amount: net,
          type: WalletTxType.AIRFARMING_FLOOR_CATCHUP,
          referenceId: `airfarming_catchup_${userId}_${formatUtcDateKey(weekStart)}`,
          description: `Airfarming weekly floor catch-up — $${net.toFixed(2)} USDT (gross $${gross.toFixed(2)}, fee $${fee.toFixed(2)})`,
          balanceAfter: this.num(wallet.availableBalance),
        },
      });
    });

    this.notifications.airfarmingDropPaid(userId, {
      amount: net,
      source: 'week_floor_catchup',
    });
  }

  private async ensureNextDropScheduled(userId: string): Promise<boolean> {
    const cfg = await this.settings();
    if (cfg.globallyPaused) return false;

    const state = await this.prisma.airfarmingState.findUnique({
      where: { userId },
    });
    if (!state || this.num(state.committedUsd) <= 0) return false;

    const weekStart = utcWeekStart();
    if (!isSameWeek(state.weekStart, weekStart)) {
      await this.ensureWeekRolled(userId, state);
    }

    const fresh = await this.prisma.airfarmingState.findUniqueOrThrow({
      where: { userId },
    });

    const pending = await this.prisma.airfarmingDrop.findFirst({
      where: {
        userId,
        weekStart: fresh.weekStart,
        status: AirfarmingDropStatus.SCHEDULED,
        dueAt: { gte: new Date() },
      },
    });
    if (pending) return false;

    const lastDrop = await this.prisma.airfarmingDrop.findFirst({
      where: { userId, weekStart: fresh.weekStart },
      orderBy: { dropIndex: 'desc' },
    });

    const dropIndex = lastDrop ? lastDrop.dropIndex + 1 : 0;
    if (dropIndex >= 9000) return false;

    const weekKey = formatUtcDateKey(fresh.weekStart);
    const bandRows = await this.bands();
    const investment = this.num(fresh.weekInvestmentUsd);
    const seed = deterministicSeed(`${userId}:${weekKey}:${dropIndex}`);
    const band = this.pickBand(seed, investment, bandRows);
    const range = this.computeRange(band, seed);
    const maxPercent = this.num(cfg.maxPercent);
    const percent = Math.min(range.percent, maxPercent);

    const intervalH = pickIntervalHours(
      userId,
      weekKey,
      dropIndex,
      cfg.dropIntervalHours.length
        ? cfg.dropIntervalHours
        : [2, 3, 5],
    );

    const base =
      lastDrop && lastDrop.dueAt.getTime() > Date.now()
        ? lastDrop.dueAt
        : new Date();
    let dueAt = new Date(base.getTime() + intervalH * 60 * 60 * 1000);
    const weekEnd = utcWeekEndExclusive(fresh.weekStart);
    if (dueAt >= weekEnd) {
      if (dropIndex === 0) {
        dueAt = new Date(Math.min(weekEnd.getTime() - 60_000, Date.now() + 30 * 60_000));
      } else {
        return false;
      }
    }

    await this.prisma.airfarmingDrop.create({
      data: {
        userId,
        weekStart: fresh.weekStart,
        dropIndex,
        dueAt,
        percent,
        minBalance: range.minBalance,
        maxBalance: range.maxBalance,
        bandIndex: band.bandIndex,
        status: AirfarmingDropStatus.SCHEDULED,
        source: AirfarmingDropSource.NATURAL,
      },
    });

    return true;
  }

  private async runFloatJobsForUser(userId: string): Promise<number> {
    const cfg = await this.settings();
    const prepMs = cfg.floatPrepHours * 60 * 60 * 1000;
    const snapshotMs = cfg.eligibilitySnapshotHours * 60 * 60 * 1000;
    const now = new Date();

    const drops = await this.prisma.airfarmingDrop.findMany({
      where: {
        userId,
        status: AirfarmingDropStatus.SCHEDULED,
        dueAt: { lte: new Date(now.getTime() + prepMs) },
      },
      orderBy: { dueAt: 'asc' },
    });

    let moved = 0;
    for (const drop of drops) {
      if (drop.eligibilitySnapshotAt == null && now.getTime() >= drop.dueAt.getTime() - snapshotMs) {
        const af = await this.getOrCreateAfWallet(userId);
        await this.prisma.airfarmingDrop.update({
          where: { id: drop.id },
          data: {
            eligibilitySnapshotAt: now,
            eligibilitySnapshotBalance: af.balance,
          },
        });
      }

      if (now.getTime() < drop.dueAt.getTime() - prepMs) continue;

      const didFloat = await this.prepareFloatForDrop(userId, drop.id);
      if (didFloat) moved++;
    }
    return moved;
  }

  private async prepareFloatForDrop(userId: string, dropId: string): Promise<boolean> {
    const drop = await this.prisma.airfarmingDrop.findUnique({ where: { id: dropId } });
    if (!drop || drop.status !== AirfarmingDropStatus.SCHEDULED) return false;

    const afWallet = await this.getOrCreateAfWallet(userId);
    const afBal = this.num(afWallet.balance);
    const min = this.num(drop.minBalance);
    const max = this.num(drop.maxBalance);

    if (afBal >= min && afBal <= max) {
      if (!drop.floatPreparedAt) {
        await this.prisma.airfarmingDrop.update({
          where: { id: dropId },
          data: { floatPreparedAt: new Date() },
        });
      }
      return false;
    }

    const platformWallet = await this.walletService.getOrCreateWallet(userId);
    const cash = this.num(platformWallet.availableBalance);
    const target = Math.min(max, Math.max(min, this.num(
      (await this.prisma.airfarmingState.findUnique({ where: { userId } }))?.committedUsd,
    )));

    const need = this.round2(Math.max(0, target - afBal));
    if (need <= 0 || cash < need) return false;

    await this.moveCashToAirfarming(userId, need, AirfarmingTransferReason.DROP_PREP, dropId);
    await this.prisma.airfarmingDrop.update({
      where: { id: dropId },
      data: { floatPreparedAt: new Date() },
    });
    return true;
  }

  private async settleDueDropsForUser(userId: string): Promise<boolean> {
    const due = await this.prisma.airfarmingDrop.findFirst({
      where: {
        userId,
        status: AirfarmingDropStatus.SCHEDULED,
        dueAt: { lte: new Date() },
      },
      orderBy: { dueAt: 'asc' },
    });
    if (!due) return false;

    await this.settleDrop(userId, due.id);
    return true;
  }

  private async settleDrop(userId: string, dropId: string) {
    const cfg = await this.settings();
    const drop = await this.prisma.airfarmingDrop.findUnique({ where: { id: dropId } });
    if (!drop || drop.status !== AirfarmingDropStatus.SCHEDULED) return;

    const afWallet = await this.getOrCreateAfWallet(userId);
    let eligibilityBalance =
      drop.eligibilitySnapshotBalance != null
        ? this.num(drop.eligibilitySnapshotBalance)
        : this.num(afWallet.balance);

    const min = this.num(drop.minBalance);
    const max = this.num(drop.maxBalance);
    const inRange = eligibilityBalance >= min && eligibilityBalance <= max;

    if (!inRange) {
      await this.prisma.airfarmingDrop.update({
        where: { id: dropId },
        data: {
          status: AirfarmingDropStatus.MISSED,
          eligibleBalance: eligibilityBalance,
          profitAmount: 0,
          paidAt: new Date(),
        },
      });
      await this.returnAllAfToCash(userId, AirfarmingTransferReason.POST_DROP_RETURN, dropId);
      await this.ensureNextDropScheduled(userId);
      await this.boostWeekFloorIfNeeded(userId);
      return;
    }

    const percent = this.num(drop.percent);
    const raw = (eligibilityBalance * percent) / 100;
    const capped = Math.min(raw, this.num(cfg.maxProfitPerDrop));
    const gross = this.round2(capped);
    const feeRate = this.num(cfg.platformFeeRate);
    const fee = this.round2(gross * feeRate);
    const net = this.round2(gross - fee);

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.platformWallet.upsert({
        where: { userId },
        create: { userId, availableBalance: net },
        update: { availableBalance: { increment: net } },
      });

      await tx.airfarmingDrop.update({
        where: { id: dropId },
        data: {
          status: AirfarmingDropStatus.PAID,
          eligibleBalance: eligibilityBalance,
          profitAmount: net,
          paidAt: new Date(),
        },
      });

      await tx.airfarmingState.update({
        where: { userId },
        data: { weekYieldUsd: { increment: net } },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          amount: net,
          type: WalletTxType.AIRFARMING_EARNING,
          referenceId: dropId,
          description: `Airfarming drop — $${net.toFixed(2)} USDT net at ${percent}% on $${eligibilityBalance.toFixed(2)}`,
          balanceAfter: this.num(wallet.availableBalance),
        },
      });
    });

    await this.returnAllAfToCash(userId, AirfarmingTransferReason.POST_DROP_RETURN, dropId);

    this.notifications.airfarmingDropPaid(userId, {
      amount: net,
      source: drop.source,
      percent,
    });

    await this.ensureNextDropScheduled(userId);
    await this.boostWeekFloorIfNeeded(userId);
  }

  private async boostWeekFloorIfNeeded(userId: string) {
    const cfg = await this.settings();
    const state = await this.prisma.airfarmingState.findUnique({ where: { userId } });
    if (!state) return;

    const investment = this.num(state.weekInvestmentUsd);
    const needed = this.round2(investment * this.num(cfg.weeklyYieldFloorRate));
    const yieldUsd = this.num(state.weekYieldUsd);
    const shortfall = this.round2(needed - yieldUsd);
    if (shortfall <= 0) return;

    const weekEnd = utcWeekEndExclusive(state.weekStart);
    const hoursLeft = (weekEnd.getTime() - Date.now()) / (60 * 60 * 1000);
    const remainingDrops = await this.prisma.airfarmingDrop.count({
      where: {
        userId,
        weekStart: state.weekStart,
        status: AirfarmingDropStatus.SCHEDULED,
      },
    });

    if (hoursLeft < 48 && remainingDrops < 3 && shortfall > 0) {
      const next = await this.prisma.airfarmingDrop.findFirst({
        where: {
          userId,
          weekStart: state.weekStart,
          status: AirfarmingDropStatus.SCHEDULED,
        },
        orderBy: { dueAt: 'asc' },
      });
      if (next) {
        const boosted = Math.min(this.num(cfg.maxPercent), this.num(next.percent) + 5);
        await this.prisma.airfarmingDrop.update({
          where: { id: next.id },
          data: {
            percent: boosted,
            source: AirfarmingDropSource.FLOOR_BOOST,
          },
        });
      } else {
        await this.ensureNextDropScheduled(userId);
      }
    }
  }

  private async maybeIdlePark(userId: string) {
    const cfg = await this.settings();
    const prepMs = cfg.floatPrepHours * 60 * 60 * 1000;
    const upcoming = await this.prisma.airfarmingDrop.findFirst({
      where: {
        userId,
        status: AirfarmingDropStatus.SCHEDULED,
        dueAt: { gte: new Date() },
      },
      orderBy: { dueAt: 'asc' },
    });

    if (upcoming && upcoming.dueAt.getTime() - Date.now() <= prepMs) return;

    await this.returnAllAfToCash(userId, AirfarmingTransferReason.IDLE_PARK, null);
  }

  private async moveCashToAirfarming(
    userId: string,
    amount: number,
    reason: AirfarmingTransferReason,
    dropId: string | null,
  ) {
    const rounded = this.round2(amount);
    if (rounded <= 0) return;

    await this.prisma.$transaction(async (tx) => {
      const debited = await tx.platformWallet.updateMany({
        where: { userId, availableBalance: { gte: rounded } },
        data: { availableBalance: { decrement: rounded } },
      });
      if (debited.count !== 1) {
        throw new BadRequestException('Insufficient cash for Airfarming float');
      }

      await tx.airfarmingWallet.upsert({
        where: { userId },
        create: { userId, balance: rounded },
        update: { balance: { increment: rounded } },
      });

      await tx.airfarmingTransfer.create({
        data: {
          userId,
          amount: rounded,
          direction: AirfarmingTransferDirection.TO_AIRFARMING,
          reason,
          relatedDropId: dropId,
        },
      });
    });
  }

  private async returnAllAfToCash(
    userId: string,
    reason: AirfarmingTransferReason,
    dropId: string | null,
  ) {
    const afWallet = await this.prisma.airfarmingWallet.findUnique({
      where: { userId },
    });
    const bal = this.num(afWallet?.balance);
    if (bal <= 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.airfarmingWallet.update({
        where: { userId },
        data: { balance: 0 },
      });
      await tx.platformWallet.upsert({
        where: { userId },
        create: { userId, availableBalance: bal },
        update: { availableBalance: { increment: bal } },
      });
      await tx.airfarmingTransfer.create({
        data: {
          userId,
          amount: bal,
          direction: AirfarmingTransferDirection.TO_CASH,
          reason,
          relatedDropId: dropId,
        },
      });
    });
  }

  async adminGetSettings() {
    const cfg = await this.settings();
    const bandRows = await this.prisma.airfarmingDropBand.findMany({
      orderBy: { bandIndex: 'asc' },
    });
    return {
      settings: {
        maxPercent: this.num(cfg.maxPercent),
        maxProfitPerDrop: this.num(cfg.maxProfitPerDrop),
        weeklyYieldFloorRate: this.num(cfg.weeklyYieldFloorRate),
        dropIntervalHours: cfg.dropIntervalHours,
        eligibilitySnapshotHours: cfg.eligibilitySnapshotHours,
        floatPrepHours: cfg.floatPrepHours,
        platformFeeRate: this.num(cfg.platformFeeRate),
        globallyPaused: cfg.globallyPaused,
      },
      bands: bandRows.map((b) => ({
        bandIndex: b.bandIndex,
        label: b.label,
        minBalance: this.num(b.minBalance),
        maxBalance: this.num(b.maxBalance),
        percent: this.num(b.percent),
        active: b.active,
      })),
    };
  }

  async adminPatchSettings(data: Partial<{
    maxPercent: number;
    maxProfitPerDrop: number;
    weeklyYieldFloorRate: number;
    dropIntervalHours: number[];
    eligibilitySnapshotHours: number;
    floatPrepHours: number;
    platformFeeRate: number;
  }>) {
    await this.prisma.airfarmingPlatformSettings.update({
      where: { id: AIRFARMING_SETTINGS_ID },
      data: {
        ...(data.maxPercent != null ? { maxPercent: data.maxPercent } : {}),
        ...(data.maxProfitPerDrop != null
          ? { maxProfitPerDrop: data.maxProfitPerDrop }
          : {}),
        ...(data.weeklyYieldFloorRate != null
          ? { weeklyYieldFloorRate: data.weeklyYieldFloorRate }
          : {}),
        ...(data.dropIntervalHours != null
          ? { dropIntervalHours: data.dropIntervalHours }
          : {}),
        ...(data.eligibilitySnapshotHours != null
          ? { eligibilitySnapshotHours: data.eligibilitySnapshotHours }
          : {}),
        ...(data.floatPrepHours != null ? { floatPrepHours: data.floatPrepHours } : {}),
        ...(data.platformFeeRate != null ? { platformFeeRate: data.platformFeeRate } : {}),
      },
    });
    return this.adminGetSettings();
  }

  async adminPatchBand(
    bandIndex: number,
    data: Partial<{
      label: string;
      minBalance: number;
      maxBalance: number;
      percent: number;
      active: boolean;
    }>,
  ) {
    await this.prisma.airfarmingDropBand.update({
      where: { bandIndex },
      data: {
        ...(data.label != null ? { label: data.label } : {}),
        ...(data.minBalance != null ? { minBalance: data.minBalance } : {}),
        ...(data.maxBalance != null ? { maxBalance: data.maxBalance } : {}),
        ...(data.percent != null ? { percent: data.percent } : {}),
        ...(data.active != null ? { active: data.active } : {}),
      },
    });
    return this.adminGetSettings();
  }

  async adminSetGlobalPause(paused: boolean) {
    await this.prisma.airfarmingPlatformSettings.update({
      where: { id: AIRFARMING_SETTINGS_ID },
      data: { globallyPaused: paused },
    });
    return { globallyPaused: paused };
  }

  async listActiveMembers(limit = 50) {
    return this.prisma.airfarmingEnrollment.findMany({
      where: { status: AirfarmingEnrollmentStatus.APPROVED },
      take: limit,
      orderBy: { approvedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            airfarmingActive: true,
            airfarmingEnrolledAt: true,
            airfarmingState: true,
            airfarmingWallet: true,
            platformWallet: { select: { availableBalance: true } },
          },
        },
      },
    });
  }
}

function isSameWeek(a: Date, b: Date): boolean {
  return formatUtcDateKey(utcWeekStart(a)) === formatUtcDateKey(utcWeekStart(b));
}

function utcWeekEndInclusive(weekStart: Date): Date {
  return new Date(utcWeekEndExclusive(weekStart).getTime() - 1);
}
