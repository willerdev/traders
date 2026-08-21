import { BadRequestException } from '@nestjs/common';
import { AirfarmingWithdrawPreference } from '@prisma/client';

export type AirfarmingApplyInput = {
  fullName: string;
  email: string;
  age: number;
  location: string;
  plannedInvestmentUsd: number;
  withdrawPreference: AirfarmingWithdrawPreference;
  acceptTerms: boolean;
};

export function parseAirfarmingApplyInput(
  body: Record<string, unknown>,
): AirfarmingApplyInput {
  try {
    const fullName = String(body.fullName ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const location = String(body.location ?? '').trim();
    const age = Math.floor(Number(body.age));
    const plannedInvestmentUsd =
      Math.round(Number(body.plannedInvestmentUsd) * 100) / 100;
    const pref = String(body.withdrawPreference ?? '').toUpperCase();
    const acceptTerms = Boolean(body.acceptTerms);

    if (fullName.length < 2) {
      throw new BadRequestException('Full name is required');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email is required');
    }
    if (!Number.isFinite(age) || age < 18 || age > 120) {
      throw new BadRequestException('Age must be between 18 and 120');
    }
    if (location.length < 2) {
      throw new BadRequestException('Location is required');
    }
    if (!Number.isFinite(plannedInvestmentUsd) || plannedInvestmentUsd <= 0) {
      throw new BadRequestException('Planned investment must be greater than zero');
    }
    if (!['WEEKLY', 'MONTHLY', 'YEARLY'].includes(pref)) {
      throw new BadRequestException(
        'Withdraw preference must be weekly, monthly, or yearly',
      );
    }
    if (!acceptTerms) {
      throw new BadRequestException('You must accept the Airfarming terms to apply');
    }

    return {
      fullName,
      email,
      age,
      location,
      plannedInvestmentUsd,
      withdrawPreference: pref as AirfarmingWithdrawPreference,
      acceptTerms,
    };
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException('Invalid application data');
  }
}
