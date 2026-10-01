/**
 * Trade Guard: seed Reserve from September 2026 withdrawals that were
 * never approved or paid (PENDING + REJECTED). PAID/APPROVED stay out.
 *
 * Usage:
 *   cd backend && npx tsx scripts/seed-withdrawal-reserve-wallets.ts
 *   cd backend && npx tsx scripts/seed-withdrawal-reserve-wallets.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  roundReserveUsdt,
  SEPTEMBER_UNAPPROVED_PAYOUT_WHERE,
} from '../src/wallet/withdrawal-reserve.util';

function loadEnv() {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnv();

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const payouts = await prisma.payout.findMany({
    where: SEPTEMBER_UNAPPROVED_PAYOUT_WHERE,
    select: {
      userId: true,
      status: true,
      virtualProfit: true,
      user: { select: { email: true } },
    },
  });

  const byUser = new Map<
    string,
    { email: string | null; pending: number; rejected: number }
  >();
  for (const payout of payouts) {
    const gross = roundReserveUsdt(Number(payout.virtualProfit));
    if (gross <= 0) continue;
    const row = byUser.get(payout.userId) ?? {
      email: payout.user.email,
      pending: 0,
      rejected: 0,
    };
    if (payout.status === 'REJECTED') row.rejected += gross;
    else row.pending += gross;
    byUser.set(payout.userId, row);
  }

  const preview: Array<{
    email: string | null;
    pending: number;
    rejected: number;
    withdrawn: number;
    available: number;
    reserve: number;
    move: number;
    skip: boolean;
  }> = [];

  for (const [userId, sums] of byUser) {
    const pending = roundReserveUsdt(sums.pending);
    const rejected = roundReserveUsdt(sums.rejected);
    const withdrawn = roundReserveUsdt(pending + rejected);
    if (withdrawn <= 0) continue;
    const wallet = await prisma.platformWallet.findUnique({
      where: { userId },
      select: { availableBalance: true, reserveBalance: true },
    });
    const available = Number(wallet?.availableBalance ?? 0);
    const reserve = Number(wallet?.reserveBalance ?? 0);
    const skip = reserve > 0;
    preview.push({
      email: sums.email,
      pending,
      rejected,
      withdrawn,
      available,
      reserve,
      move: skip ? 0 : roundReserveUsdt(Math.min(available, rejected)),
      skip,
    });
  }

  const toSeed = preview.filter((p) => !p.skip);
  const totalReserve = roundReserveUsdt(
    toSeed.reduce((s, p) => s + p.withdrawn, 0),
  );
  const totalMove = roundReserveUsdt(toSeed.reduce((s, p) => s + p.move, 0));

  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}  users=${preview.length} seed=${toSeed.length} skip=${preview.length - toSeed.length} reserve=$${totalReserve.toFixed(2)} fromAvailable=$${totalMove.toFixed(2)} (rejected refunds only)`,
  );
  for (const row of preview.sort((a, b) => b.withdrawn - a.withdrawn)) {
    console.log(
      `${row.skip ? 'SKIP' : 'SEED'}  ${row.email ?? '(no email)'}  pending=$${row.pending.toFixed(2)}  rejected=$${row.rejected.toFixed(2)}  reserve=$${row.withdrawn.toFixed(2)}  available=$${row.available.toFixed(2)}  move=$${row.move.toFixed(2)}`,
    );
  }

  if (!apply) {
    console.log('Re-run with --apply to write Reserve wallets.');
    return;
  }

  let seeded = 0;
  for (const [userId, sums] of byUser) {
    const pending = roundReserveUsdt(sums.pending);
    const rejected = roundReserveUsdt(sums.rejected);
    const withdrawn = roundReserveUsdt(pending + rejected);
    if (withdrawn <= 0) continue;
    const wallet = await prisma.platformWallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    if (Number(wallet.reserveBalance ?? 0) > 0) continue;
    const available = Number(wallet.availableBalance);
    const movedFromAvailable = roundReserveUsdt(Math.min(available, rejected));
    const nextAvailable = roundReserveUsdt(available - movedFromAvailable);
    await prisma.$transaction([
      prisma.platformWallet.update({
        where: { userId },
        data: {
          availableBalance: nextAvailable,
          reserveBalance: withdrawn,
        },
      }),
      prisma.walletTransaction.create({
        data: {
          userId,
          amount: -movedFromAvailable,
          type: 'RESERVE_HOLD',
          description: `Reserve wallet — $${withdrawn.toFixed(2)} USDT from September withdrawals that were not approved. $${movedFromAvailable.toFixed(2)} moved from Available.`,
          balanceAfter: nextAvailable,
        },
      }),
    ]);
    seeded += 1;
  }
  console.log(`Seeded ${seeded} Reserve wallets.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
