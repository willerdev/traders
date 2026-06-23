import { BadRequestException, Injectable } from '@nestjs/common';
import { PROMO_CODES } from '../common/constants';

export interface PromoValidation {
  code: string;
  discountPercent: number;
  description: string;
  finalAmount: number;
  originalAmount: number;
}

@Injectable()
export class PromoService {
  normalize(code: string): string {
    return code.trim().toLowerCase();
  }

  validate(code: string, originalAmount: number): PromoValidation {
    const normalized = this.normalize(code);
    const promo = PROMO_CODES[normalized];

    if (!promo) {
      throw new BadRequestException('Invalid promo code');
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
    };
  }

  isFreeRegistration(code: string, originalAmount: number): boolean {
    const result = this.validate(code, originalAmount);
    return result.finalAmount <= 0;
  }
}
