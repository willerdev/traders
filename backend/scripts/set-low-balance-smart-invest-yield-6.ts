/**
 * Set 6% daily Smart Invest yield for low-balance investors (< $300):
 * - Veve (yvettemunezero922@gmail.com)
 * - Ely2020 (nelysa2020@gmail.com)
 * - Eric MASENGESHO (masnhoe@hotmail.com)
 *
 * Idempotent: skips users already at 6%.
 *
 * Usage: cd backend && npx tsx scripts/set-low-balance-smart-invest-yield-6.ts
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

const DAILY_YIELD_PERCENT = 6;

const TARGETS = [
  { email: 'yvettemunezero922@gmail.com', label: 'Veve' },
  { email: 'nelysa2020@gmail.com', label: 'Ely2020' },
  { email: 'masnhoe@hotmail.com', label: 'Eric MASENGESHO' },
] as const;

const prisma = new PrismaClient();

function effectiveYield(
  stored: number | null | undefined,
  platformYield: number,
): number {
  return stored != null ? stored : platformYield;
}

async function snapshot(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      investorActive: true,
      investorSettings: {
        select: { dailyYieldPercent: true, updatedAt: true },
      },
      platformWallet: { select: { investorBalance: true } },
    },
  });
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    investorActive: user.investorActive,
    investorBalance: user.platformWallet
      ? Number(user.platformWallet.investorBalance)
      : 0,
    storedYield:
      user.investorSettings?.dailyYieldPercent != null
        ? Number(user.investorSettings.dailyYieldPercent)
        : null,
    updatedAt: user.investorSettings?.updatedAt ?? null,
  };
}

async function main() {
  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
    select: { investorDailyYieldPercent: true },
  });
  const platformYield = Number(config?.investorDailyYieldPercent ?? 8);

  console.log('Platform default yield:', `${platformYield}%`);
  console.log('Target yield:', `${DAILY_YIELD_PERCENT}%`);
  console.log('--- BEFORE ---');

  const before = new Map<string, Awaited<ReturnType<typeof snapshot>>>();
  for (const { email, label } of TARGETS) {
    const row = await snapshot(email);
    if (!row) {
      console.log(`${label} (${email}): NOT FOUND`);
      continue;
    }
    before.set(email, row);
    console.log(
      JSON.stringify({
        label,
        ...row,
        effectiveYieldPercent: effectiveYield(row.storedYield, platformYield),
      }),
    );
  }

  console.log('--- UPDATE ---');
  const results: Array<{
    email: string;
    label: string;
    oldStoredYield: number | null;
    oldEffectiveYield: number;
    newStoredYield: number;
    skipped: boolean;
  }> = [];

  for (const { email, label } of TARGETS) {
    const row = before.get(email);
    if (!row) continue;

    const oldEffective = effectiveYield(row.storedYield, platformYield);
    if (row.storedYield === DAILY_YIELD_PERCENT) {
      console.log(`${label} (${email}): already ${DAILY_YIELD_PERCENT}% — skipped`);
      results.push({
        email,
        label,
        oldStoredYield: row.storedYield,
        oldEffectiveYield: oldEffective,
        newStoredYield: DAILY_YIELD_PERCENT,
        skipped: true,
      });
      continue;
    }

    const settings = await prisma.investorSettings.upsert({
      where: { userId: row.userId },
      create: {
        userId: row.userId,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
      },
      update: {
        dailyYieldPercent: DAILY_YIELD_PERCENT,
      },
      select: { dailyYieldPercent: true, updatedAt: true },
    });

    const newStored = Number(settings.dailyYieldPercent);
    console.log(
      `${label} (${email}): ${row.storedYield ?? `null (effective ${oldEffective}%)`} → ${newStored}%`,
    );
    results.push({
      email,
      label,
      oldStoredYield: row.storedYield,
      oldEffectiveYield: oldEffective,
      newStoredYield: newStored,
      skipped: false,
    });
  }

  console.log('--- AFTER ---');
  for (const { email, label } of TARGETS) {
    const row = await snapshot(email);
    if (!row) continue;
    console.log(
      JSON.stringify({
        label,
        ...row,
        effectiveYieldPercent: effectiveYield(row.storedYield, platformYield),
      }),
    );
  }

  console.log('--- SUMMARY ---');
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
