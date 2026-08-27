/**
 * One-off: set Uwiduhaye Diane (uwiduhaye3@gmail.com) to 8% daily yield
 * after today's Kampala credit job (16:00). Run at or after 16:05 Kampala on 2026-08-27.
 *
 * Usage: cd backend && npx tsx scripts/set-uwiduhaye-yield-8-after-today.ts
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

const USER_ID = 'cms991i7m01zlfa0186vwzgli';
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.investorSettings.update({
    where: { userId: USER_ID },
    data: { dailyYieldPercent: 8 },
    select: { userId: true, dailyYieldPercent: true, updatedAt: true },
  });
  console.log('Updated investor yield:', settings);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
