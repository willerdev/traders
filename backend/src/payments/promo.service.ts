import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PROMO_DEFAULT_VALIDITY_DAYS } from '../common/constants';

export interface PromoValidation {
  code: string;
  discountPercent: number;
  description: string;
  finalAmount: number;
  originalAmount: number;
  expiresAt: string;
}

@Injectable()
export class PromoService {
  constructor(private prisma: PrismaService) {}

  normalize(code: string): string {
    return code.trim().toLowerCase();
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

    const discount = Math.min(100, Math.max(0, promo.discountPercent));
    const finalAmount =
      Math.round(originalAmount * (1 - discount / 100) * 100) / 100;

    return {
      code: normalized,
      discountPercent: discount,
      description: promo.description,
      finalAmount,
      originalAmount,
      expiresAt: promo.expiresAt.toISOString(),
    };
  }

  async isFreeRegistration(
    code: string,
    originalAmount: number,
  ): Promise<boolean> {
    const result = await this.validate(code, originalAmount);
    return result.finalAmount <= 0;
  }

  async listAll() {
    const rows = await this.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return rows.map((p) => this.formatPromo(p, now));
  }

  async create(
    adminId: string,
    input: {
      code: string;
      discountPercent?: number;
      description?: string;
      expiresInDays?: number;
      expiresAt?: string;
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

    const promo = await this.prisma.promoCode.create({
      data: {
        code,
        discountPercent,
        description:
          input.description?.trim() ||
          `${discountPercent}% off registration`,
        expiresAt,
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
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    return this.formatPromo(promo, new Date());
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

    return this.formatPromo(updated, new Date());
  }

  private formatPromo(
    promo: {
      id: string;
      code: string;
      discountPercent: number;
      description: string;
      expiresAt: Date;
      active: boolean;
      createdAt: Date;
    },
    now: Date,
  ) {
    const expired = promo.expiresAt <= now;
    return {
      id: promo.id,
      code: promo.code,
      discountPercent: promo.discountPercent,
      description: promo.description,
      expiresAt: promo.expiresAt.toISOString(),
      active: promo.active,
      expired,
      valid: promo.active && !expired,
      createdAt: promo.createdAt.toISOString(),
    };
  }
}
