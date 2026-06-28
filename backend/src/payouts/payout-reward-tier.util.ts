import { PrismaClient } from '@prisma/client';

export const PAYOUT_REWARD_WINDOW = 10;

export const PAYOUT_REWARD_TIERS = [
  {
    id: 'STARTER',
    label: 'Starter',
    amountUsdt: 10,
    winsMin: 0,
    winsMax: 6,
    requirement: 'Less than 5 wins out of 10 setups',
  },
  {
    id: 'PRO',
    label: 'Pro',
    amountUsdt: 50,
    winsMin: 7,
    winsMax: 7,
    requirement: '7 wins out of 10 setups',
  },
  {
    id: 'ELITE',
    label: 'Elite',
    amountUsdt: 100,
    winsMin: 8,
    winsMax: 10,
    requirement: '8+ wins out of 10 setups',
  },
] as const;

export type PayoutRewardTierId = (typeof PAYOUT_REWARD_TIERS)[number]['id'];

export function resolvePayoutRewardTier(wins: number) {
  if (wins >= 8) {
    return {
      tierId: 'ELITE' as const,
      label: 'Elite',
      amountUsdt: 100,
      nextTierId: null as PayoutRewardTierId | null,
      winsToNextTier: 0,
    };
  }
  if (wins >= 7) {
    return {
      tierId: 'PRO' as const,
      label: 'Pro',
      amountUsdt: 50,
      nextTierId: 'ELITE' as const,
      winsToNextTier: 8 - wins,
    };
  }
  return {
    tierId: 'STARTER' as const,
    label: 'Starter',
    amountUsdt: 10,
    nextTierId: 'PRO' as const,
    winsToNextTier: Math.max(0, 7 - wins),
  };
}

export async function getPayoutRewardStatus(
  prisma: PrismaClient,
  userId: string,
) {
  const recent = await prisma.signal.findMany({
    where: { userId, status: { in: ['WON', 'LOST'] } },
    orderBy: { resolvedAt: 'desc' },
    take: PAYOUT_REWARD_WINDOW,
    select: { status: true },
  });

  const wins = recent.filter((s) => s.status === 'WON').length;
  const losses = recent.filter((s) => s.status === 'LOST').length;
  const resolved = recent.length;
  const tier = resolvePayoutRewardTier(wins);

  return {
    windowSize: PAYOUT_REWARD_WINDOW,
    resolved,
    wins,
    losses,
    currentTierId: tier.tierId,
    currentTierLabel: tier.label,
    currentRewardUsdt: tier.amountUsdt,
    nextTierId: tier.nextTierId,
    winsToNextTier: tier.winsToNextTier,
    tiers: PAYOUT_REWARD_TIERS,
    recentResults: recent.map((s) => (s.status === 'WON' ? 'W' : 'L')),
  };
}
