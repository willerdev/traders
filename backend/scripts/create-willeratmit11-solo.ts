/**
 * Create soloema / soloRukundo login for willeratmit11@gmail.com.
 * Usage: DATABASE_URL=... npx tsx scripts/create-willeratmit11-solo.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const EMAIL = 'willeratmit11@gmail.com';
const DISPLAY_NAME = 'Willer';
const PASSWORD = process.env.SOLO_NEW_USER_PASSWORD;
if (!PASSWORD) {
  throw new Error('SOLO_NEW_USER_PASSWORD is required');
}

const prisma = new PrismaClient();

async function main() {
  const probe = await prisma.user.findFirst({
    where: { email: { equals: 'etuyizere64@gmail.com', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!probe) {
    throw new Error('Wrong database (etuyizere64 missing) — abort');
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
    select: { id: true, email: true, status: true },
  });
  if (existing) {
    console.log(
      JSON.stringify({
        ok: true,
        alreadyExists: true,
        userId: existing.id,
        email: existing.email,
        status: existing.status,
      }),
    );
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const referralCode = randomBytes(4).toString('hex').toUpperCase();
  const now = new Date();

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash,
      displayName: DISPLAY_NAME,
      role: 'TRADER',
      status: 'ACTIVE',
      emailVerified: true,
      registrationPaid: true,
      termsAcceptedAt: now,
      referralCode,
    },
  });

  await prisma.virtualAccount.create({
    data: {
      userId: user.id,
      balance: 1000,
      maxRiskPerTrade: 50,
      riskPercent: 5,
    },
  });
  await prisma.platformWallet.create({
    data: { userId: user.id },
  });
  await prisma.kycVerification.create({
    data: { userId: user.id, status: 'NOT_STARTED' },
  });

  console.log(
    JSON.stringify({
      ok: true,
      created: true,
      userId: user.id,
      email: EMAIL,
      displayName: DISPLAY_NAME,
      status: user.status,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
