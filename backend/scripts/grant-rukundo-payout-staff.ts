/**
 * Grant payout-approver staff permission to rukundo18@gmail.com (Olive).
 *
 * Usage: cd backend && npx tsx scripts/grant-rukundo-payout-staff.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const EMAIL = 'rukundo18@gmail.com';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      adminCanApprovePayouts: true,
    },
  });

  if (!user) {
    throw new Error(`User not found: ${EMAIL}`);
  }

  if (user.role === 'ADMIN') {
    console.log(`${EMAIL} is already full ADMIN — no staff flag needed`);
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { adminCanApprovePayouts: true },
    select: {
      id: true,
      email: true,
      displayName: true,
      adminCanApprovePayouts: true,
    },
  });

  console.log('Granted payout staff permission:', updated);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
