import { ForbiddenException } from '@nestjs/common';
import { isSoloApp } from './app-variant';

const DEFAULT_SOLO_ADMIN_EMAIL = 'willeratmit12@gmail.com';

export const SOLO_TRADE_FORBIDDEN =
  'Only the soloEmma admin can place trades, close trades, set limits, or add signals to execute.';

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

/** Solo: only ADMIN_EMAIL may place/close/limit/signal. Other apps: anyone authenticated. */
export function canSoloManageTrades(email?: string | null): boolean {
  if (!isSoloApp()) return true;
  return isSoloAdminEmail(email);
}

export function assertSoloCanManageTrades(email?: string | null): void {
  if (canSoloManageTrades(email)) return;
  throw new ForbiddenException(SOLO_TRADE_FORBIDDEN);
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
