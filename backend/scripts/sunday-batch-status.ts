/**
 * Read-only: Sunday batch payout status snapshot.
 * Usage: cd backend && npx tsx scripts/sunday-batch-status.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  formatKampalaDateTime,
  sundayUtcEnd,
  sundayUtcStart,
} from '../src/payouts/sunday-withdraw-batch.util';

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

async function main() {
  const now = new Date();
  const dayStart = sundayUtcStart(now);
  const dayEnd = sundayUtcEnd(now);

  const [config, payouts] = await Promise.all([
    prisma.platformConfig.findUnique({ where: { id: 'default' } }),
    prisma.payout.findMany({
      where: {
        source: 'DEPOSITOR',
        scheduledApproveAt: { not: null, gte: dayStart },
      },
      include: {
        user: { select: { displayName: true, email: true } },
      },
      orderBy: { scheduledApproveAt: 'asc' },
    }),
  ]);

  const byStatus = (s: string) => payouts.filter((p) => p.status === s);

  console.log(
    JSON.stringify(
      {
        snapshotAt: now.toISOString(),
        snapshotEat: formatKampalaDateTime(now),
        dayStart: dayStart.toISOString(),
        dayEnd: dayEnd.toISOString(),
        batchConfig: {
          anchor: config?.sundayWithdrawBatchAnchor?.toISOString() ?? null,
          finalizedAt:
            config?.sundayWithdrawBatchFinalizedAt?.toISOString() ?? null,
        },
        summary: {
          total: payouts.length,
          PAID: byStatus('PAID').length,
          APPROVED: byStatus('APPROVED').length,
          PENDING: byStatus('PENDING').length,
          FAILED: byStatus('FAILED').length,
          dispatched: payouts.filter((p) => p.gatewayPayoutId).length,
        },
        payouts: payouts.map((p, i) => ({
          pos: i + 1,
          id: p.id,
          name: p.user.displayName,
          email: p.user.email,
          amount: Number(p.traderShare),
          status: p.status,
          gatewayPayoutId: p.gatewayPayoutId,
          wallet: p.walletAddress,
          scheduledUtc: p.scheduledApproveAt?.toISOString(),
          scheduledEat: p.scheduledApproveAt
            ? formatKampalaDateTime(p.scheduledApproveAt)
            : null,
          processedAt: p.processedAt?.toISOString() ?? null,
          due: p.scheduledApproveAt ? p.scheduledApproveAt <= now : false,
          notesTail: (p.notes ?? '').slice(-200),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
