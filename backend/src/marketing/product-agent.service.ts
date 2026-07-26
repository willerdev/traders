import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { isRegistrationEmailAllowed } from '../common/email-quality.util';

const PROFILE_LOOKBACK_DAYS = 30;
const MAX_SENDS_PER_TICK = 40;
const SEND_DELAY_MS = 500;
const SEND_COUNTS = [1, 3, 5] as const;

type DetectKey =
  | 'investor'
  | 'depositor'
  | 'investor_vip'
  | 'auto_reinvest';

export type BehaviorProfileDoc = {
  userId: string;
  displayName: string;
  email: string | null;
  rebuiltAt: string;
  presence: {
    lastSeenAt: string | null;
    lastPath: string | null;
    activeHoursUtc: number[];
    topPaths: { path: string; count: number }[];
    sessionsApprox: number;
  };
  investing: {
    investorActive: boolean;
    depositorActive: boolean;
    investorVipActive: boolean;
    autoReinvest: boolean;
    investorBalance: number;
    availableBalance: number;
    dailyYieldPercent: number | null;
    activeDepositorPlans: number;
    prefersDailyYield: boolean;
    prefersDepositorPlans: boolean;
    onlineMostlyEvenings: boolean;
  };
  products: Record<
    string,
    { enrolled: boolean; name: string; cadence: string }
  >;
  unusedProductSlugs: string[];
  styleHints: string[];
};

type SeedProduct = {
  slug: string;
  name: string;
  description: string;
  cadence: string;
  yieldLabel: string;
  ctaPath: string;
  detectKey: DetectKey;
  sortOrder: number;
};

const DEFAULT_PRODUCTS: SeedProduct[] = [
  {
    slug: 'smart_invest_daily',
    name: 'Smart Invest (daily yield)',
    description:
      'Daily return investment account — balance earns yield every day.',
    cadence: 'daily',
    yieldLabel: 'Daily yield',
    ctaPath: '/invest',
    detectKey: 'investor',
    sortOrder: 10,
  },
  {
    slug: 'depositor_daily_plans',
    name: 'Depositor daily plans',
    description:
      'Fixed depositor plans that credit daily yield for a set window.',
    cadence: 'daily',
    yieldLabel: 'Daily plan credits',
    ctaPath: '/invest',
    detectKey: 'depositor',
    sortOrder: 20,
  },
  {
    slug: 'investor_vip',
    name: 'Investor VIP',
    description: 'VIP investor tier with elevated access and yield treatment.',
    cadence: 'weekly',
    yieldLabel: 'VIP tier',
    ctaPath: '/invest',
    detectKey: 'investor_vip',
    sortOrder: 30,
  },
  {
    slug: 'auto_reinvest',
    name: 'Auto-reinvest earnings',
    description:
      'Compound daily earnings automatically (90% reinvested after fee).',
    cadence: 'daily',
    yieldLabel: 'Compound daily',
    ctaPath: '/invest',
    detectKey: 'auto_reinvest',
    sortOrder: 40,
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startOfUtcWeek(d = new Date()): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = x.getUTCDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class ProductAgentService {
  private readonly logger = new Logger(ProductAgentService.name);
  private planning = false;
  private sending = false;
  private rebuilding = false;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  // ─── Cron ───────────────────────────────────────────────────────────────

  /** Seed products + rebuild profiles every night. */
  @Cron('20 2 * * *')
  async nightlyMaintenance() {
    await this.ensureDefaultProducts();
    await this.syncAllEnrollments();
    await this.rebuildAllProfiles();
  }

  /** Plan the week every Monday 00:15 UTC. */
  @Cron('15 0 * * 1')
  async mondayPlanJob() {
    await this.ensureDefaultProducts();
    await this.syncAllEnrollments();
    await this.rebuildAllProfiles();
    await this.planWeek('cron');
  }

  /** Send due planned emails every 10 minutes. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendDueJob() {
    await this.sendDuePlans('cron');
  }

  // ─── Products ────────────────────────────────────────────────────────────

  async ensureDefaultProducts() {
    for (const p of DEFAULT_PRODUCTS) {
      await this.prisma.returnProduct.upsert({
        where: { slug: p.slug },
        create: {
          slug: p.slug,
          name: p.name,
          description: p.description,
          cadence: p.cadence,
          yieldLabel: p.yieldLabel,
          ctaPath: p.ctaPath,
          detectKey: p.detectKey,
          sortOrder: p.sortOrder,
          active: true,
          launchedAt: new Date(),
        },
        update: {
          name: p.name,
          description: p.description,
          cadence: p.cadence,
          yieldLabel: p.yieldLabel,
          ctaPath: p.ctaPath,
          detectKey: p.detectKey,
          sortOrder: p.sortOrder,
        },
      });
    }
  }

  async listProducts() {
    await this.ensureDefaultProducts();
    const products = await this.prisma.returnProduct.findMany({
      orderBy: [{ sortOrder: 'asc' }, { launchedAt: 'desc' }],
      include: {
        _count: {
          select: {
            enrollments: { where: { active: true } },
            plans: { where: { status: 'PLANNED' } },
          },
        },
      },
    });
    return { items: products };
  }

  async createProduct(input: {
    slug: string;
    name: string;
    description: string;
    cadence?: string;
    yieldLabel?: string;
    ctaPath?: string;
    detectKey?: string;
  }) {
    const slug = input.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_|_$/g, '');
    if (!slug) throw new BadRequestException('Invalid slug');
    if (!input.name?.trim()) throw new BadRequestException('Name required');

    const product = await this.prisma.returnProduct.create({
      data: {
        slug,
        name: input.name.trim(),
        description: (input.description || '').trim() || input.name.trim(),
        cadence: input.cadence === 'weekly' ? 'weekly' : 'daily',
        yieldLabel: input.yieldLabel?.trim() || null,
        ctaPath: input.ctaPath?.trim() || '/invest',
        detectKey: input.detectKey?.trim() || 'manual',
        active: true,
        launchedAt: new Date(),
        sortOrder: 100,
      },
    });
    this.logger.log(`Return product created: ${product.slug}`);
    return product;
  }

  // ─── Enrollments ─────────────────────────────────────────────────────────

  async syncAllEnrollments() {
    const products = await this.prisma.returnProduct.findMany({
      where: { active: true },
    });
    if (!products.length) return { synced: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        role: { not: 'ADMIN' },
        status: { notIn: ['BANNED'] },
      },
      select: {
        id: true,
        investorActive: true,
        depositorActive: true,
        investorVipActive: true,
        investorSettings: { select: { autoReinvestEarnings: true } },
        platformWallet: { select: { investorBalance: true } },
        depositorPlans: {
          where: { status: 'ACTIVE' },
          select: { id: true },
          take: 1,
        },
      },
    });

    const shouldBeActive: { userId: string; productId: string }[] = [];
    for (const u of users) {
      for (const p of products) {
        if (this.detectEnrollment(p.detectKey as DetectKey, u)) {
          shouldBeActive.push({ userId: u.id, productId: p.id });
        }
      }
    }

    const autoProductIds = products
      .filter((p) => p.detectKey !== 'manual')
      .map((p) => p.id);

    // Deactivate auto enrollments that no longer match.
    if (autoProductIds.length) {
      const keepKeys = new Set(
        shouldBeActive.map((x) => `${x.userId}:${x.productId}`),
      );
      const existing = await this.prisma.userProductEnrollment.findMany({
        where: {
          source: 'auto',
          active: true,
          productId: { in: autoProductIds },
        },
        select: { id: true, userId: true, productId: true },
      });
      const deactivateIds = existing
        .filter((e) => !keepKeys.has(`${e.userId}:${e.productId}`))
        .map((e) => e.id);
      if (deactivateIds.length) {
        await this.prisma.userProductEnrollment.updateMany({
          where: { id: { in: deactivateIds } },
          data: { active: false },
        });
      }
    }

    // Upsert active enrollments in chunks.
    let synced = 0;
    const chunk = 100;
    for (let i = 0; i < shouldBeActive.length; i += chunk) {
      const slice = shouldBeActive.slice(i, i + chunk);
      await Promise.all(
        slice.map((row) =>
          this.prisma.userProductEnrollment.upsert({
            where: {
              userId_productId: {
                userId: row.userId,
                productId: row.productId,
              },
            },
            create: {
              userId: row.userId,
              productId: row.productId,
              source: 'auto',
              active: true,
            },
            update: { active: true, source: 'auto' },
          }),
        ),
      );
      synced += slice.length;
    }

    return { synced };
  }

  private detectEnrollment(
    key: DetectKey | string,
    u: {
      investorActive: boolean;
      depositorActive: boolean;
      investorVipActive: boolean;
      investorSettings: { autoReinvestEarnings: boolean } | null;
      platformWallet: { investorBalance: Prisma.Decimal } | null;
      depositorPlans: { id: string }[];
    },
  ): boolean {
    switch (key) {
      case 'investor':
        return (
          u.investorActive &&
          Number(u.platformWallet?.investorBalance ?? 0) > 0
        );
      case 'depositor':
        return u.depositorActive && u.depositorPlans.length > 0;
      case 'investor_vip':
        return u.investorVipActive;
      case 'auto_reinvest':
        return Boolean(u.investorSettings?.autoReinvestEarnings);
      default:
        return false;
    }
  }

  // ─── Profiles ────────────────────────────────────────────────────────────

  async rebuildAllProfiles(limit?: number) {
    if (this.rebuilding) {
      return { ok: false, message: 'Already rebuilding' };
    }
    this.rebuilding = true;
    try {
      await this.ensureDefaultProducts();
      const users = await this.prisma.user.findMany({
        where: {
          role: { not: 'ADMIN' },
          status: { notIn: ['BANNED'] },
          email: { not: null },
        },
        select: { id: true },
        take: limit ?? 5000,
        orderBy: { updatedAt: 'desc' },
      });
      let rebuilt = 0;
      const concurrency = 8;
      for (let i = 0; i < users.length; i += concurrency) {
        const slice = users.slice(i, i + concurrency);
        await Promise.all(slice.map((u) => this.rebuildProfileForUser(u.id)));
        rebuilt += slice.length;
      }
      this.logger.log(`Rebuilt ${rebuilt} behavior profiles`);
      return { ok: true, rebuilt };
    } finally {
      this.rebuilding = false;
    }
  }

  async rebuildProfileForUser(userId: string): Promise<BehaviorProfileDoc> {
    const since = new Date(
      Date.now() - PROFILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const [user, events, products, enrollments] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          displayName: true,
          email: true,
          presenceLastSeenAt: true,
          presencePath: true,
          investorActive: true,
          depositorActive: true,
          investorVipActive: true,
          investorSettings: {
            select: {
              autoReinvestEarnings: true,
              dailyYieldPercent: true,
            },
          },
          platformWallet: {
            select: { investorBalance: true, availableBalance: true },
          },
          depositorPlans: {
            where: { status: 'ACTIVE' },
            select: { id: true },
          },
        },
      }),
      this.prisma.userPageEvent.findMany({
        where: { userId, seenAt: { gte: since } },
        select: { path: true, seenAt: true },
        orderBy: { seenAt: 'desc' },
        take: 2000,
      }),
      this.prisma.returnProduct.findMany({ where: { active: true } }),
      this.prisma.userProductEnrollment.findMany({
        where: { userId, active: true },
        select: { productId: true },
      }),
    ]);

    const hourCounts = new Array(24).fill(0);
    const pathCounts = new Map<string, number>();
    for (const e of events) {
      hourCounts[e.seenAt.getUTCHours()] += 1;
      const base = e.path.split('?')[0] || '/';
      pathCounts.set(base, (pathCounts.get(base) || 0) + 1);
    }
    // Seed last path if no events yet
    if (user.presencePath && events.length === 0) {
      const base = user.presencePath.split('?')[0] || '/';
      pathCounts.set(base, 1);
      if (user.presenceLastSeenAt) {
        hourCounts[user.presenceLastSeenAt.getUTCHours()] += 1;
      }
    }

    const activeHoursUtc = hourCounts
      .map((c, h) => ({ h, c }))
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c)
      .slice(0, 6)
      .map((x) => x.h)
      .sort((a, b) => a - b);

    const topPaths = [...pathCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([path, count]) => ({ path, count }));

    const eveningHits = hourCounts
      .slice(17, 23)
      .reduce((a, b) => a + b, 0);
    const totalHits = hourCounts.reduce((a, b) => a + b, 0) || 1;
    const onlineMostlyEvenings = eveningHits / totalHits >= 0.4;

    const enrolledIds = new Set(enrollments.map((e) => e.productId));
    const productMap: BehaviorProfileDoc['products'] = {};
    const unused: string[] = [];
    for (const p of products) {
      const enrolled = enrolledIds.has(p.id);
      productMap[p.slug] = {
        enrolled,
        name: p.name,
        cadence: p.cadence,
      };
      if (!enrolled) unused.push(p.slug);
    }

    const prefersDepositorPlans =
      topPaths.some((p) => p.path.includes('deposit')) ||
      user.depositorActive;
    const prefersDailyYield =
      user.investorActive ||
      topPaths.some((p) => p.path.startsWith('/invest') || p.path === '/journal');

    const styleHints: string[] = [];
    if (prefersDailyYield) styleHints.push('Talk about daily compounding and Smart Invest.');
    if (prefersDepositorPlans) styleHints.push('Highlight fixed depositor plan credits.');
    if (onlineMostlyEvenings) styleHints.push('User is usually online evenings UTC.');
    if (user.investorActive && !user.investorSettings?.autoReinvestEarnings) {
      styleHints.push('Already investing — pitch auto-reinvest compounding.');
    }
    if (!user.investorActive && !user.depositorActive) {
      styleHints.push('Not on any return product yet — introduce Smart Invest gently.');
    }
    if (unused.includes('investor_vip') && user.investorActive) {
      styleHints.push('Active investor who is not VIP yet.');
    }

    const doc: BehaviorProfileDoc = {
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      rebuiltAt: new Date().toISOString(),
      presence: {
        lastSeenAt: user.presenceLastSeenAt?.toISOString() ?? null,
        lastPath: user.presencePath,
        activeHoursUtc,
        topPaths,
        sessionsApprox: Math.max(1, Math.ceil(events.length / 3)),
      },
      investing: {
        investorActive: user.investorActive,
        depositorActive: user.depositorActive,
        investorVipActive: user.investorVipActive,
        autoReinvest: Boolean(user.investorSettings?.autoReinvestEarnings),
        investorBalance: Number(user.platformWallet?.investorBalance ?? 0),
        availableBalance: Number(user.platformWallet?.availableBalance ?? 0),
        dailyYieldPercent: user.investorSettings?.dailyYieldPercent
          ? Number(user.investorSettings.dailyYieldPercent)
          : null,
        activeDepositorPlans: user.depositorPlans.length,
        prefersDailyYield,
        prefersDepositorPlans,
        onlineMostlyEvenings,
      },
      products: productMap,
      unusedProductSlugs: unused,
      styleHints,
    };

    await this.prisma.userBehaviorProfile.upsert({
      where: { userId },
      create: {
        userId,
        profile: doc as unknown as Prisma.InputJsonValue,
        rebuiltAt: new Date(),
      },
      update: {
        profile: doc as unknown as Prisma.InputJsonValue,
        rebuiltAt: new Date(),
      },
    });

    return doc;
  }

  async listProfiles(limit = 50, offset = 0) {
    const take = Math.min(Math.max(limit, 1), 200);
    const [rows, count] = await Promise.all([
      this.prisma.userBehaviorProfile.findMany({
        orderBy: { rebuiltAt: 'desc' },
        take,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              status: true,
              investorActive: true,
              depositorActive: true,
            },
          },
        },
      }),
      this.prisma.userBehaviorProfile.count(),
    ]);
    return {
      count,
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        rebuiltAt: r.rebuiltAt.toISOString(),
        user: r.user,
        profile: r.profile as BehaviorProfileDoc,
      })),
    };
  }

  async getProfile(userId: string) {
    const row = await this.prisma.userBehaviorProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: { id: true, displayName: true, email: true, status: true },
        },
      },
    });
    if (!row) {
      const profile = await this.rebuildProfileForUser(userId);
      return { userId, rebuiltAt: profile.rebuiltAt, profile };
    }
    return {
      userId: row.userId,
      rebuiltAt: row.rebuiltAt.toISOString(),
      user: row.user,
      profile: row.profile as BehaviorProfileDoc,
    };
  }

  // ─── Planning ────────────────────────────────────────────────────────────

  async planWeek(
    trigger: 'cron' | 'manual',
    opts?: { force?: boolean; skipSync?: boolean },
  ) {
    if (this.planning) {
      return { ok: false, message: 'Planning already running', created: 0 };
    }
    this.planning = true;
    try {
      this.logger.log(`Product agent planWeek start (${trigger})`);
      await this.ensureDefaultProducts();
      if (!opts?.skipSync) {
        await this.syncAllEnrollments();
      }

      const now = new Date();
      let weekStart = startOfUtcWeek(now);
      let weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
      // Late in the week → plan the upcoming week so slots aren't all in the past.
      if (weekEnd.getTime() - now.getTime() < 12 * 60 * 60 * 1000) {
        weekStart = new Date(weekEnd);
        weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
      }

      if (!opts?.force) {
        const existing = await this.prisma.productAgentPlan.count({
          where: { weekStart, status: { in: ['PLANNED', 'SENT'] } },
        });
        if (existing > 0 && trigger === 'cron') {
          return {
            ok: true,
            message: 'Week already planned',
            weekStart: weekStart.toISOString(),
            created: 0,
            existing,
          };
        }
      }

      if (opts?.force) {
        await this.prisma.productAgentPlan.updateMany({
          where: { weekStart, status: 'PLANNED' },
          data: { status: 'CANCELLED', detail: 'Replanned' },
        });
      }

      const products = await this.prisma.returnProduct.findMany({
        where: { active: true },
        orderBy: [{ launchedAt: 'desc' }, { sortOrder: 'asc' }],
      });
      if (!products.length) {
        return { ok: false, message: 'No active products', created: 0 };
      }

      const users = await this.prisma.user.findMany({
        where: {
          role: { not: 'ADMIN' },
          status: { notIn: ['BANNED', 'SUSPENDED'] },
          email: { not: null },
          behaviorProfile: { isNot: null },
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          behaviorProfile: { select: { profile: true } },
          productEnrollments: {
            where: { active: true },
            select: { productId: true },
          },
        },
      });

      const rows: Prisma.ProductAgentPlanCreateManyInput[] = [];
      const createdSamples: Array<{
        userId: string;
        email: string;
        product: string;
        plannedAt: string;
        sendsPerWeek: number;
        subject: string;
      }> = [];

      for (const u of users) {
        if (!u.email || !isRegistrationEmailAllowed(u.email)) continue;

        const enrolled = new Set(u.productEnrollments.map((e) => e.productId));
        const unused = products.filter((p) => !enrolled.has(p.id));
        if (!unused.length) continue;

        const profile = u.behaviorProfile
          ?.profile as BehaviorProfileDoc | null;
        if (!profile) continue;

        const sendsPerWeek = pickRandom([...SEND_COUNTS]);
        const preferredHours =
          profile.presence.activeHoursUtc.length > 0
            ? profile.presence.activeHoursUtc
            : [9, 12, 16, 19];

        const slots = this.pickSlots(
          weekStart,
          weekEnd,
          now,
          sendsPerWeek,
          preferredHours,
        );
        if (!slots.length) continue;
        const productsForSlots = shuffle(unused).slice(0, slots.length);
        while (productsForSlots.length < slots.length) {
          productsForSlots.push(pickRandom(unused));
        }

        for (let i = 0; i < slots.length; i++) {
          const product = productsForSlots[i];
          const copy = this.buildCopy(profile, product, u.displayName);
          rows.push({
            userId: u.id,
            productId: product.id,
            weekStart,
            plannedAt: slots[i],
            sendsPerWeek,
            subject: copy.subject,
            previewHtml: copy.html,
            previewText: copy.text,
            copyAngle: copy.angle,
            status: 'PLANNED',
            detail: `trigger:${trigger}`,
          });
          if (createdSamples.length < 25) {
            createdSamples.push({
              userId: u.id,
              email: u.email,
              product: product.slug,
              plannedAt: slots[i].toISOString(),
              sendsPerWeek,
              subject: copy.subject,
            });
          }
        }
      }

      const chunk = 50;
      for (let i = 0; i < rows.length; i += chunk) {
        await this.prisma.productAgentPlan.createMany({
          data: rows.slice(i, i + chunk),
        });
      }

      this.logger.log(
        `Product agent planned ${rows.length} emails for week ${weekStart.toISOString()} (${trigger})`,
      );
      return {
        ok: true,
        weekStart: weekStart.toISOString(),
        created: rows.length,
        trigger,
        samples: createdSamples,
      };
    } finally {
      this.planning = false;
    }
  }

  private pickSlots(
    weekStart: Date,
    weekEnd: Date,
    now: Date,
    count: number,
    preferredHours: number[],
  ): Date[] {
    const candidates: Date[] = [];
    for (let d = 0; d < 7; d++) {
      for (const h of preferredHours) {
        const slot = new Date(weekStart);
        slot.setUTCDate(slot.getUTCDate() + d);
        slot.setUTCHours(h, Math.floor(Math.random() * 50), 0, 0);
        if (slot >= weekStart && slot < weekEnd && slot > now) {
          candidates.push(slot);
        }
      }
      // Always add a midday fallback slot
      const mid = new Date(weekStart);
      mid.setUTCDate(mid.getUTCDate() + d);
      mid.setUTCHours(14, Math.floor(Math.random() * 40), 0, 0);
      if (mid > now && mid < weekEnd) candidates.push(mid);
    }
    const uniqueDays = new Map<string, Date>();
    for (const c of shuffle(candidates)) {
      const key = c.toISOString().slice(0, 13); // hour bucket
      if (!uniqueDays.has(key)) uniqueDays.set(key, c);
    }
    return shuffle([...uniqueDays.values()])
      .slice(0, count)
      .sort((a, b) => a.getTime() - b.getTime());
  }

  private buildCopy(
    profile: BehaviorProfileDoc,
    product: {
      slug: string;
      name: string;
      description: string;
      cadence: string;
      yieldLabel: string | null;
      ctaPath: string;
    },
    displayName: string,
  ): { subject: string; html: string; text: string; angle: string } {
    const name = displayName?.trim() || 'there';
    const url = this.email.frontendUrl;
    const cta = `${url}${product.ctaPath.startsWith('/') ? product.ctaPath : `/${product.ctaPath}`}`;
    const yieldBit = product.yieldLabel || `${product.cadence} returns`;

    let angle = 'intro';
    let hook = `There's a ${product.cadence} return product on Tradeguard you aren't using yet.`;

    if (
      profile.investing.investorActive &&
      product.slug === 'auto_reinvest'
    ) {
      angle = 'compound_existing';
      hook =
        'Your Smart Invest balance is earning — auto-reinvest can compound it for you.';
    } else if (
      profile.investing.investorActive &&
      product.slug === 'investor_vip'
    ) {
      angle = 'upgrade_vip';
      hook = 'You already invest with us — VIP unlocks the next tier.';
    } else if (
      profile.investing.prefersDailyYield &&
      product.cadence === 'daily'
    ) {
      angle = 'daily_affinity';
      hook = `You spend time on Invest / Journal — ${product.name} fits how you already use Tradeguard.`;
    } else if (
      profile.investing.prefersDepositorPlans &&
      product.slug === 'depositor_daily_plans'
    ) {
      angle = 'depositor_affinity';
      hook = 'Fixed daily plan credits match the depositor-style flow you lean toward.';
    } else if (!profile.investing.investorActive && !profile.investing.depositorActive) {
      angle = 'cold_intro';
      hook = `${product.name} is a simple way to start earning ${yieldBit.toLowerCase()} on Tradeguard.`;
    }

    const subjects = [
      `${name}, you're missing ${product.name}`,
      `${product.name} — ${yieldBit} you aren't using yet`,
      `Quick note: ${product.name} is live and you're not on it`,
    ];
    const subject = pickRandom(subjects);

    const hints =
      profile.styleHints.length > 0
        ? `<p style="color:#94a3b8;font-size:13px;">Based on how you use Tradeguard: ${profile.styleHints[0]}</p>`
        : '';

    const html = this.email.layout(
      product.name,
      `<p>Hi ${name},</p>
      <p>${hook}</p>
      <p><strong>${product.name}</strong> — ${product.description}</p>
      <p style="color:#cbd5e1;">Cadence: <strong>${product.cadence}</strong>${
        product.yieldLabel ? ` · ${product.yieldLabel}` : ''
      }</p>
      ${hints}
      ${this.email.button(cta, `Open ${product.name}`)}
      <p style="color:#64748b;font-size:12px;margin-top:24px;">You're receiving this because this return product is available and your account isn't using it yet.</p>`,
    );
    const text = `Hi ${name}, ${hook} ${product.name}: ${product.description} Open: ${cta}`;

    return { subject, html, text, angle };
  }

  // ─── Sending ─────────────────────────────────────────────────────────────

  async sendDuePlans(trigger: 'cron' | 'manual') {
    if (this.sending) {
      return { ok: false, message: 'Send already running', sent: 0 };
    }
    this.sending = true;
    try {
      if (!this.email.isConfigured) {
        return {
          ok: false,
          message: 'Email not configured',
          sent: 0,
          emailConfigured: false,
        };
      }

      const due = await this.prisma.productAgentPlan.findMany({
        where: {
          status: 'PLANNED',
          plannedAt: { lte: new Date() },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              status: true,
            },
          },
          product: true,
        },
        orderBy: { plannedAt: 'asc' },
        take: MAX_SENDS_PER_TICK,
      });

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const plan of due) {
        const email = plan.user.email?.trim().toLowerCase();
        if (
          !email ||
          plan.user.status === 'BANNED' ||
          !isRegistrationEmailAllowed(email)
        ) {
          await this.prisma.productAgentPlan.update({
            where: { id: plan.id },
            data: { status: 'SKIPPED', detail: 'No valid email / banned' },
          });
          skipped += 1;
          continue;
        }

        // Skip if they enrolled since planning
        const enrolled = await this.prisma.userProductEnrollment.findFirst({
          where: {
            userId: plan.userId,
            productId: plan.productId,
            active: true,
          },
        });
        if (enrolled) {
          await this.prisma.productAgentPlan.update({
            where: { id: plan.id },
            data: {
              status: 'SKIPPED',
              detail: 'User enrolled before send',
            },
          });
          skipped += 1;
          continue;
        }

        const ok = await this.email.send({
          to: email,
          subject: plan.subject,
          html: plan.previewHtml,
          text: plan.previewText,
        });

        await this.prisma.productAgentPlan.update({
          where: { id: plan.id },
          data: {
            status: ok ? 'SENT' : 'FAILED',
            sentAt: ok ? new Date() : null,
            detail: `${plan.detail ?? ''};send:${trigger}`,
          },
        });

        await this.prisma.marketingEmail.create({
          data: {
            userId: plan.userId,
            email,
            audience: `product_agent:${plan.product.slug}`,
            subject: plan.subject,
            status: ok ? 'SENT' : 'FAILED',
            detail: `plan:${plan.id};angle:${plan.copyAngle}`,
          },
        });

        if (ok) sent += 1;
        else failed += 1;
        await sleep(SEND_DELAY_MS);
      }

      if (sent || skipped || failed) {
        this.logger.log(
          `Product agent send (${trigger}): sent=${sent} skipped=${skipped} failed=${failed}`,
        );
      }
      return {
        ok: true,
        emailConfigured: true,
        due: due.length,
        sent,
        skipped,
        failed,
      };
    } finally {
      this.sending = false;
    }
  }

  // ─── Admin views ─────────────────────────────────────────────────────────

  async getOverview() {
    await this.ensureDefaultProducts();
    const weekStart = startOfUtcWeek();
    const [
      products,
      profileCount,
      planned,
      sentThisWeek,
      dueSoon,
      pageEvents,
    ] = await Promise.all([
      this.prisma.returnProduct.count({ where: { active: true } }),
      this.prisma.userBehaviorProfile.count(),
      this.prisma.productAgentPlan.count({
        where: { weekStart, status: 'PLANNED' },
      }),
      this.prisma.productAgentPlan.count({
        where: { weekStart, status: 'SENT' },
      }),
      this.prisma.productAgentPlan.count({
        where: {
          status: 'PLANNED',
          plannedAt: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.userPageEvent.count({
        where: {
          seenAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      emailConfigured: this.email.isConfigured,
      emailFrom: this.email.from,
      weekStart: weekStart.toISOString(),
      cadence:
        'Each eligible user randomly gets 1, 3, or 5 product emails per week (Mon plan → send when due)',
      stats: {
        activeProducts: products,
        profiles: profileCount,
        plannedThisWeek: planned,
        sentThisWeek,
        dueWithin24h: dueSoon,
        pageEventsLast7d: pageEvents,
      },
    };
  }

  async listPlans(opts: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const take = Math.min(Math.max(opts.limit ?? 100, 1), 300);
    const offset = opts.offset ?? 0;
    const where: Prisma.ProductAgentPlanWhereInput = {};
    if (opts.status && opts.status !== 'all') {
      where.status = opts.status.toUpperCase();
    }

    const [items, count] = await Promise.all([
      this.prisma.productAgentPlan.findMany({
        where,
        orderBy: [{ plannedAt: 'asc' }],
        take,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              status: true,
            },
          },
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              cadence: true,
              yieldLabel: true,
            },
          },
        },
      }),
      this.prisma.productAgentPlan.count({ where }),
    ]);

    return {
      count,
      items: items.map((p) => ({
        id: p.id,
        status: p.status,
        weekStart: p.weekStart.toISOString(),
        plannedAt: p.plannedAt.toISOString(),
        sentAt: p.sentAt?.toISOString() ?? null,
        sendsPerWeek: p.sendsPerWeek,
        subject: p.subject,
        copyAngle: p.copyAngle,
        previewText: p.previewText,
        detail: p.detail,
        user: p.user,
        product: p.product,
      })),
    };
  }
}
