import { ForbiddenException } from '@nestjs/common';
import { isSoloApp } from './app-variant';

const DEFAULT_SOLO_ADMIN_EMAIL = 'willeratmit12@gmail.com';

export const SOLO_TRADE_FORBIDDEN =
  'You cannot place or manage live trades on this account.';

export const SOLO_REGISTRATION_CLOSED =
  'New accounts are no longer accepted. Sign in if you already have an account.';

export function getSoloAdminEmails(): string[] {
  const raw = (
    process.env.ADMIN_EMAIL ||
    process.env.SOLO_ADMIN_EMAIL ||
    DEFAULT_SOLO_ADMIN_EMAIL
  ).trim();
  return raw
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isSoloAdminEmail(email?: string | null): boolean {
  if (!email?.trim()) return false;
  return getSoloAdminEmails().includes(email.trim().toLowerCase());
}

/** Solo: platform admin or flagged trade operator. Other apps: anyone authenticated. */
export function canSoloManageTrades(
  email?: string | null,
  extra?: {
    soloTradeOperator?: boolean | null;
    canManageTrades?: boolean | null;
  },
): boolean {
  if (!isSoloApp()) return true;
  if (isSoloAdminEmail(email)) return true;
  return Boolean(extra?.soloTradeOperator);
}

export function assertSoloCanManageTrades(
  email?: string | null,
  extra?: {
    soloTradeOperator?: boolean | null;
    canManageTrades?: boolean | null;
  },
): void {
  if (canSoloManageTrades(email, extra)) return;
  throw new ForbiddenException(SOLO_TRADE_FORBIDDEN);
}

export function assertSoloPlatformAdmin(email?: string | null): void {
  if (isSoloAdminEmail(email)) return;
  throw new ForbiddenException(
    'Only the platform admin can change trader risk limits.',
  );
}

export function soloAdminRole(
  email: string | null | undefined,
  role: string,
): string {
  if (isSoloApp() && isSoloAdminEmail(email)) return 'ADMIN';
  return role;
}

type PrismaUserLookup = {
  user: {
    findFirst: (args: {
      where: {
        OR: Array<{ email: { equals: string; mode: 'insensitive' } }>;
      };
      select: { id: true; email: true };
      orderBy: { createdAt: 'asc' };
    }) => Promise<{ id: string; email: string | null } | null>;
  };
};

/** On soloEmma, every viewer uses the admin's linked MetaAPI / Deriv account. */
export async function resolveSoloSharedOwnerUserId(
  prisma: PrismaUserLookup,
  fallbackUserId: string,
): Promise<{
  ownerUserId: string;
  shared: boolean;
  ownerEmail: string | null;
}> {
  if (!isSoloApp()) {
    return {
      ownerUserId: fallbackUserId,
      shared: false,
      ownerEmail: null,
    };
  }
  const emails = getSoloAdminEmails();
  if (emails.length === 0) {
    return {
      ownerUserId: fallbackUserId,
      shared: false,
      ownerEmail: null,
    };
  }
  const admin = await prisma.user.findFirst({
    where: {
      OR: emails.map((email) => ({
        email: { equals: email, mode: 'insensitive' },
      })),
    },
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    return {
      ownerUserId: fallbackUserId,
      shared: false,
      ownerEmail: null,
    };
  }
  return {
    ownerUserId: admin.id,
    shared: true,
    ownerEmail: admin.email,
  };
}
