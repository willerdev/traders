import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PROMO_DEFAULT_VALIDITY_DAYS } from '../common/constants';

export interface PromoValidation {
  code: string;
  discountPercent: number;
  description: string;
  finalAmount: number;
  originalAmount: number;
  expiresAt: string;
  maxUses: number | null;
  usedCount: number;
  remainingUses: number | null;
}

@Injectable()
export class PromoService {
  constructor(private prisma: PrismaService) {}

  normalize(code: string): string {
    return code.trim().toLowerCase();
  }

  private promoCodeFromPayment(payment: {
    gatewayId: string | null;
    gatewayResponse: unknown;
  }): string | null {
    const stored = (payment.gatewayResponse ?? {}) as Record<string, unknown>;
    if (typeof stored.promoCode === 'string' && stored.promoCode.trim()) {
      return this.normalize(stored.promoCode);
    }
    if (payment.gatewayId?.startsWith('promo_')) {
      return this.normalize(payment.gatewayId.slice('promo_'.length));
    }
    return null;
  }

  async getUsageCount(code: string): Promise<number> {
    const normalized = this.normalize(code);
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'CONFIRMED',
        purpose: 'registration',
        OR: [
          { gatewayId: `promo_${normalized}` },
          { gatewayResponse: { path: ['promoCode'], equals: normalized } },
        ],
      },
      select: { id: true },
    });
    return payments.length;
  }

  private async getUsageCountsMap(): Promise<Map<string, number>> {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'CONFIRMED',
        purpose: 'registration',
        OR: [
          { gatewayId: { startsWith: 'promo_' } },
          { gatewayResponse: { path: ['promoCode'], string_contains: '' } },
        ],
      },
      select: { gatewayId: true, gatewayResponse: true },
    });

    const counts = new Map<string, number>();
    for (const payment of payments) {
      const code = this.promoCodeFromPayment(payment);
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }

  private assertWithinUseLimit(
    promo: { maxUses: number | null },
    usedCount: number,
  ) {
    if (promo.maxUses != null && promo.maxUses > 0 && usedCount >= promo.maxUses) {
      throw new BadRequestException('This promo code has already been used');
    }
  }

  async validate(code: string, originalAmount: number): Promise<PromoValidation> {
    const normalized = this.normalize(code);
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: normalized },
    });

    if (!promo || !promo.active) {
      throw new BadRequestException('Invalid promo code');
    }

    if (new Date() > promo.expiresAt) {
      throw new BadRequestException('This promo code has expired');
    }

    const usedCount = await this.getUsageCount(normalized);
    this.assertWithinUseLimit(promo, usedCount);

    const discount = Math.min(100, Math.max(0, promo.discountPercent));
    const finalAmount =
      Math.round(originalAmount * (1 - discount / 100) * 100) / 100;

    const remainingUses =
      promo.maxUses != null && promo.maxUses > 0
        ? Math.max(0, promo.maxUses - usedCount)
        : null;

    return {
      code: normalized,
      discountPercent: discount,
      description: promo.description,
      finalAmount,
      originalAmount,
      expiresAt: promo.expiresAt.toISOString(),
      maxUses: promo.maxUses,
      usedCount,
      remainingUses,
    };
  }

  async isFreeRegistration(
    code: string,
    originalAmount: number,
  ): Promise<boolean> {
    const result = await this.validate(code, originalAmount);
    return result.finalAmount <= 0;
  }

  /** After a confirmed registration redemption — auto-deactivate when limit reached. */
  async afterRedemption(code: string) {
    const normalized = this.normalize(code);
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: normalized },
    });
    if (!promo?.maxUses || promo.maxUses <= 0) return;

    const usedCount = await this.getUsageCount(normalized);
    if (usedCount >= promo.maxUses && promo.active) {
      await this.prisma.promoCode.update({
        where: { code: normalized },
        data: { active: false },
      });
    }
  }

  async listAll() {
    const [rows, usageCounts] = await Promise.all([
      this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } }),
      this.getUsageCountsMap(),
    ]);
    const now = new Date();
    return rows.map((p) =>
      this.formatPromo(p, now, usageCounts.get(p.code) ?? 0),
    );
  }

  /**
   * Payments where a promo code was used. Covers both 100% invite codes
   * (gatewayId "promo_<code>") and partial-discount checkouts
   * (promoCode stored in gatewayResponse).
   */
  async listUsage(limit = 200) {
    const payments = await this.prisma.payment.findMany({
      where: {
        OR: [
          { gatewayId: { startsWith: 'promo_' } },
          { gatewayResponse: { path: ['promoCode'], string_contains: '' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            referredBy: {
              select: { id: true, displayName: true, email: true },
            },
          },
        },
      },
    });

    return payments.map((p) => {
      const code = this.promoCodeFromPayment(p) ?? 'unknown';
      const stored = (p.gatewayResponse ?? {}) as Record<string, unknown>;
      return {
        paymentId: p.id,
        code,
        discountPercent:
          typeof stored.discountPercent === 'number'
            ? stored.discountPercent
            : null,
        originalAmount:
          typeof stored.originalAmount === 'number'
            ? stored.originalAmount
            : null,
        amountPaid: Number(p.amount),
        status: p.status,
        usedAt: p.createdAt.toISOString(),
        confirmedAt: p.confirmedAt?.toISOString() ?? null,
        user: {
          id: p.user.id,
          displayName: p.user.displayName,
          email: p.user.email,
        },
        referredBy: p.user.referredBy
          ? {
              id: p.user.referredBy.id,
              displayName: p.user.referredBy.displayName,
              email: p.user.referredBy.email,
            }
          : null,
      };
    });
  }

  async create(
    adminId: string,
    input: {
      code: string;
      discountPercent?: number;
      description?: string;
      expiresInDays?: number;
      expiresAt?: string;
      maxUses?: number;
    },
  ) {
    const code = this.normalize(input.code);
    if (!/^[a-z0-9_-]{3,32}$/.test(code)) {
      throw new BadRequestException(
        'Code must be 3–32 characters (letters, numbers, underscore, hyphen)',
      );
    }

    const existing = await this.prisma.promoCode.findUnique({
      where: { code },
    });
    if (existing) {
      throw new BadRequestException('A promo code with this name already exists');
    }

    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : new Date(
          Date.now() +
            (input.expiresInDays ?? PROMO_DEFAULT_VALIDITY_DAYS) *
              24 *
              60 *
              60 *
              1000,
        );

    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new BadRequestException('Expiry must be in the future');
    }

    const discountPercent = Math.min(
      100,
      Math.max(0, input.discountPercent ?? 100),
    );

    const maxUses =
      input.maxUses != null && input.maxUses > 0
        ? Math.floor(input.maxUses)
        : null;

    const description =
      input.description?.trim() ||
      (maxUses === 1
        ? 'Single-use offline payer activation'
        : `${discountPercent}% off registration`);

    const promo = await this.prisma.promoCode.create({
      data: {
        code,
        discountPercent,
        description,
        expiresAt,
        maxUses,
        createdById: adminId,
        active: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'PROMO_CREATED',
        targetId: promo.id,
        metadata: {
          code,
          discountPercent,
          maxUses,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    return this.formatPromo(promo, new Date(), 0);
  }

  async createBulk(
    adminId: string,
    input: {
      count: number;
      prefix?: string;
      discountPercent?: number;
      description?: string;
      expiresInDays?: number;
      maxUses?: number;
    },
  ) {
    const count = Math.min(100, Math.max(1, Math.floor(input.count)));
    const prefix = this.normalize(input.prefix?.trim() || 'offline').replace(
      /[^a-z0-9_-]/g,
      '',
    );
    if (prefix.length < 2 || prefix.length > 20) {
      throw new BadRequestException(
        'Prefix must be 2–20 characters (letters, numbers, underscore, hyphen)',
      );
    }

    const created: Array<{
      id: string;
      code: string;
      discountPercent: number;
      description: string;
      expiresAt: string;
      active: boolean;
      maxUses: number | null;
      usedCount: number;
      remainingUses: number | null;
      exhausted?: boolean;
      expired: boolean;
      valid: boolean;
      singleUse?: boolean;
      createdAt: string;
    }> = [];
    const expiresInDays = input.expiresInDays ?? 30;
    const maxUses = input.maxUses ?? 1;
    const discountPercent = input.discountPercent ?? 100;

    for (let attempt = 0; created.length < count && attempt < count * 5; attempt++) {
      const suffix = randomBytes(3).toString('hex');
      const code = `${prefix}-${suffix}`.slice(0, 32);
      try {
        const promo = await this.create(adminId, {
          code,
          discountPercent,
          description:
            input.description?.trim() ||
            'Single-use offline payer activation',
          expiresInDays,
          maxUses,
        });
        created.push(promo);
      } catch (err) {
        if (
          err instanceof BadRequestException &&
          String(err.message).includes('already exists')
        ) {
          continue;
        }
        throw err;
      }
    }

    if (created.length < count) {
      throw new BadRequestException(
        `Could only generate ${created.length} of ${count} unique codes — try again`,
      );
    }

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'PROMO_BULK_CREATED',
        metadata: {
          count: created.length,
          prefix,
          maxUses,
          discountPercent,
          codes: created.map((c) => c.code),
        },
      },
    });

    return { count: created.length, items: created };
  }

  async deactivate(code: string, adminId: string) {
    const normalized = this.normalize(code);
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: normalized },
    });
    if (!promo) {
      throw new BadRequestException('Promo code not found');
    }

    const updated = await this.prisma.promoCode.update({
      where: { code: normalized },
      data: { active: false },
    });

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'PROMO_DEACTIVATED',
        targetId: updated.id,
        metadata: { code: normalized },
      },
    });

    const usedCount = await this.getUsageCount(normalized);
    return this.formatPromo(updated, new Date(), usedCount);
  }

  private formatPromo(
    promo: {
      id: string;
      code: string;
      discountPercent: number;
      description: string;
      expiresAt: Date;
      active: boolean;
      maxUses: number | null;
      createdAt: Date;
    },
    now: Date,
    usedCount: number,
  ) {
    const expired = promo.expiresAt <= now;
    const exhausted =
      promo.maxUses != null &&
      promo.maxUses > 0 &&
      usedCount >= promo.maxUses;
    const remainingUses =
      promo.maxUses != null && promo.maxUses > 0
        ? Math.max(0, promo.maxUses - usedCount)
        : null;

    return {
      id: promo.id,
      code: promo.code,
      discountPercent: promo.discountPercent,
      description: promo.description,
      expiresAt: promo.expiresAt.toISOString(),
      active: promo.active,
      maxUses: promo.maxUses,
      usedCount,
      remainingUses,
      exhausted,
      expired,
      valid: promo.active && !expired && !exhausted,
      singleUse: promo.maxUses === 1,
      createdAt: promo.createdAt.toISOString(),
    };
  }
}
