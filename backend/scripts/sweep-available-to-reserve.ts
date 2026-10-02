/**
 * Trade Guard: move all Available wallet funds (not Smart Invest / Unitrust)
 * into Reserve. Adds on top of any existing Reserve.
 *
 * Usage:
 *   cd backend && npx tsx scripts/sweep-available-to-reserve.ts
 *   cd backend && npx tsx scripts/sweep-available-to-reserve.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { roundReserveUsdt } from '../src/wallet/withdrawal-reserve.util';

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
  const wallets = await prisma.platformWallet.findMany({
    where: { availableBalance: { gt: 0 } },
    select: {
      userId: true,
      availableBalance: true,
      reserveBalance: true,
      investorBalance: true,
      user: { select: { email: true } },
    },
    orderBy: { availableBalance: 'desc' },
  });

  const totalMove = roundReserveUsdt(
    wallets.reduce((sum, w) => sum + Number(w.availableBalance), 0),
  );

  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}  users=${wallets.length} moveAvailable=$${totalMove.toFixed(2)} (Smart Invest left in place)`,
  );
  for (const w of wallets) {
    const moved = roundReserveUsdt(Number(w.availableBalance));
    const nextReserve = roundReserveUsdt(Number(w.reserveBalance ?? 0) + moved);
    console.log(
      `${w.user.email ?? w.userId}  available=$${moved.toFixed(2)}  invest=$${Number(w.investorBalance).toFixed(2)}  reserveNow=$${Number(w.reserveBalance).toFixed(2)}  reserveAfter=$${nextReserve.toFixed(2)}`,
    );
  }

  if (!apply) {
    console.log('Re-run with --apply to move Available into Reserve.');
    return;
  }

  let movedUsers = 0;
  let movedUsdt = 0;
  for (const w of wallets) {
    const moved = roundReserveUsdt(Number(w.availableBalance));
    if (moved <= 0) continue;
    const nextReserve = roundReserveUsdt(Number(w.reserveBalance ?? 0) + moved);
    await prisma.$transaction([
      prisma.platformWallet.update({
        where: { userId: w.userId },
        data: {
          availableBalance: 0,
          reserveBalance: nextReserve,
        },
      }),
      prisma.walletTransaction.create({
        data: {
          userId: w.userId,
          amount: -moved,
          type: 'RESERVE_HOLD',
          description: `Reserve wallet — $${moved.toFixed(2)} USDT moved from Available (wallet funds not in investment).`,
          balanceAfter: 0,
        },
      }),
    ]);
    movedUsers += 1;
    movedUsdt += moved;
  }
  console.log(
    `Moved $${roundReserveUsdt(movedUsdt).toFixed(2)} from Available into Reserve for ${movedUsers} users.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
