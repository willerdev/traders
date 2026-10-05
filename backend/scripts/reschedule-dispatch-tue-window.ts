/**
 * Reschedule active PENDING dispatch batch evenly Tue 18:00 → Wed 09:00 EAT,
 * with a natural-looking delivery order, then email admin.
 *
 * Idempotent: re-run reproduces the same order and slot times.
 *
 * Usage:
 *   cd backend && npx tsx scripts/reschedule-dispatch-tue-window.ts
 *
 * Env (optional):
 *   FIRST_DELIVERY_UTC=2026-09-08T15:00:00.000Z   Tue 18:00 EAT
 *   LAST_DELIVERY_UTC=2026-09-09T06:00:00.000Z    Wed 09:00 EAT
 *   ADMIN_EMAIL=willeratmit12@gmail.com
 *   DRY_RUN=1
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  SUNDAY_BATCH_ADJUSTMENT_PERCENT,
  applySundayBatchAdjustment,
  formatKampalaDateTime,
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
const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const adminEmail =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

/** Tue 8 Sep 2026 18:00 EAT */
const FIRST_DELIVERY_UTC =
  process.env.FIRST_DELIVERY_UTC || '2026-09-08T15:00:00.000Z';
/** Wed 9 Sep 2026 09:00 EAT */
const LAST_DELIVERY_UTC =
  process.env.LAST_DELIVERY_UTC || '2026-09-09T06:00:00.000Z';

type PayoutRow = {
  id: string;
  status: string;
  traderShare: Prisma.Decimal;
  platformShare: Prisma.Decimal;
  virtualProfit: Prisma.Decimal;
  walletAddress: string | null;
  scheduledApproveAt: Date | null;
  requestedAt: Date;
  notes: string | null;
  displayName: string;
  email: string | null;
  investorVvipActive: boolean;
};

type Tier = 'S' | 'M' | 'H' | 'L';

/** Fixed interleave pattern for typical batch sizes (14 slots). */
const DISPATCH_PATTERN: Tier[] = [
  'S',
  'M',
  'S',
  'M',
  'S',
  'M',
  'S',
  'H',
  'M',
  'L',
  'S',
  'H',
  'M',
  'L',
];

const TIER_FALLBACK: Tier[] = ['S', 'M', 'H', 'L'];

function formatKampalaWhen(date: Date) {
  return date.toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatUtcWhen(date: Date) {
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function evenSlots(count: number, firstMs: number, lastMs: number): Date[] {
  if (count <= 0) return [];
  if (count === 1) return [new Date(firstMs)];
  const step = (lastMs - firstMs) / (count - 1);
  return Array.from({ length: count }, (_, i) => new Date(firstMs + step * i));
}

function stripPriorRescheduleNotes(notes: string | null) {
  return (notes ?? '')
    .replace(/\s*— Rescheduled auto-delivery[^—]*?(?= —|$)/g, '')
    .replace(/\s*— Custom dispatch window[^—]*?(?= —|$)/g, '')
    .replace(/\s*— Tue 18:00 dispatch[^—]*?(?= —|$)/g, '')
    .replace(/\s*— Dispatch window[^—]*?(?= —|$)/g, '')
    .trim();
}

function hasBatchAdjustment(notes: string | null) {
  return /Sunday batch (9% adjustment|VVIP waiver)/.test(notes ?? '');
}

function netTier(net: number): Tier {
  if (net < 200) return 'S';
  if (net < 500) return 'M';
  if (net < 900) return 'H';
  return 'L';
}

function sortWithinTier(a: PayoutRow, b: PayoutRow) {
  const byRequested = a.requestedAt.getTime() - b.requestedAt.getTime();
  if (byRequested !== 0) return byRequested;
  return a.id.localeCompare(b.id);
}

/** Natural-looking mix: smaller amounts tend earlier without strict amount sorting. */
export function subtleDispatchOrder(payouts: PayoutRow[]): PayoutRow[] {
  const pools: Record<Tier, PayoutRow[]> = { S: [], M: [], H: [], L: [] };
  for (const p of payouts) {
    pools[netTier(Number(p.traderShare))].push(p);
  }
  for (const tier of TIER_FALLBACK) {
    pools[tier].sort(sortWithinTier);
  }

  const result: PayoutRow[] = [];
  let patternIdx = 0;

  while (result.length < payouts.length) {
    const preferred = DISPATCH_PATTERN[patternIdx % DISPATCH_PATTERN.length];
    patternIdx++;

    let picked: PayoutRow | undefined;
    if (pools[preferred].length > 0) {
      picked = pools[preferred].shift();
    } else {
      for (const tier of TIER_FALLBACK) {
        if (pools[tier].length > 0) {
          picked = pools[tier].shift();
          break;
        }
      }
    }
    if (!picked) break;
    result.push(picked);
  }

  return result;
}

function batchAdjustmentUpdate(p: PayoutRow): {
  traderShare: number;
  platformShare: number;
  noteSuffix: string;
} | null {
  if (hasBatchAdjustment(p.notes)) return null;

  const originalNet = Number(p.traderShare);
  const platformShare = Number(p.platformShare);

  if (p.investorVvipActive) {
    return {
      traderShare: originalNet,
      platformShare,
      noteSuffix: `Sunday batch VVIP waiver — no ${SUNDAY_BATCH_ADJUSTMENT_PERCENT}% adjustment; net $${originalNet.toFixed(2)} USDT`,
    };
  }

  const { adjustedNet, reduction } = applySundayBatchAdjustment(originalNet);
  return {
    traderShare: adjustedNet,
    platformShare: Math.round((platformShare + reduction) * 100) / 100,
    noteSuffix: `Sunday batch ${SUNDAY_BATCH_ADJUSTMENT_PERCENT}% adjustment: net $${originalNet.toFixed(2)} → $${adjustedNet.toFixed(2)} USDT`,
  };
}

async function fetchPendingBatch(dayStart: Date): Promise<PayoutRow[]> {
  return prisma.$queryRaw<PayoutRow[]>`
    SELECT
      p.id,
      p.status,
      p."traderShare",
      p."platformShare",
      p."virtualProfit",
      p."walletAddress",
      p."scheduledApproveAt",
      p."requestedAt",
      p.notes,
      u."displayName",
      u.email,
      u."investorVvipActive"
    FROM payouts p
    JOIN users u ON u.id = p."userId"
    WHERE p.status = 'PENDING'
      AND p.source = 'DEPOSITOR'
      AND p."walletAddress" IS NOT NULL
      AND (p."payoutMethod" IS NULL OR p."payoutMethod" != 'MOBILE_MONEY')
      AND p."scheduledApproveAt" IS NOT NULL
      AND p."scheduledApproveAt" >= ${dayStart}
    ORDER BY p."scheduledApproveAt" ASC
  `;
}

async function main() {
  const now = new Date();
  const dayStart = sundayUtcStart(now);
  const firstDelivery = new Date(FIRST_DELIVERY_UTC);
  const lastDelivery = new Date(LAST_DELIVERY_UTC);

  if (Number.isNaN(firstDelivery.getTime()) || Number.isNaN(lastDelivery.getTime())) {
    throw new Error('Invalid FIRST_DELIVERY_UTC or LAST_DELIVERY_UTC');
  }
  if (lastDelivery.getTime() < firstDelivery.getTime()) {
    throw new Error('LAST_DELIVERY_UTC must be after FIRST_DELIVERY_UTC');
  }

  const batch = await fetchPendingBatch(dayStart);
  if (batch.length === 0) {
    throw new Error('No PENDING batch payouts to schedule');
  }

  const payouts = subtleDispatchOrder(batch);
  const slots = evenSlots(
    payouts.length,
    firstDelivery.getTime(),
    lastDelivery.getTime(),
  );
  const intervalMinutes =
    payouts.length > 1
      ? (lastDelivery.getTime() - firstDelivery.getTime()) /
        (payouts.length - 1) /
        60000
      : 0;

  type Row = {
    pos: number;
    payoutId: string;
    name: string;
    email: string | null;
    net: number;
    status: string;
    scheduled: Date;
  };

  const rows: Row[] = [];

  for (let i = 0; i < payouts.length; i++) {
    const p = payouts[i];
    const scheduledAt = slots[i];
    let net = Number(p.traderShare);
    const adj = batchAdjustmentUpdate(p);
    if (adj) net = adj.traderShare;

    const rescheduleNote = `Dispatch window ${formatKampalaDateTime(scheduledAt)} Kampala (even spread Tue 18:00 → Wed 09:00 EAT)`;
    const baseNotes = stripPriorRescheduleNotes(p.notes);
    const notes = [baseNotes, adj?.noteSuffix, rescheduleNote]
      .filter(Boolean)
      .join(' — ')
      .trim();

    if (!dryRun) {
      if (adj) {
        await prisma.$executeRaw`
          UPDATE payouts
          SET "scheduledApproveAt" = ${scheduledAt},
              "traderShare" = ${adj.traderShare},
              "platformShare" = ${adj.platformShare},
              notes = ${notes}
          WHERE id = ${p.id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE payouts
          SET "scheduledApproveAt" = ${scheduledAt},
              notes = ${notes}
          WHERE id = ${p.id}
        `;
      }
    }

    rows.push({
      pos: i + 1,
      payoutId: p.id,
      name: p.displayName,
      email: p.email,
      net,
      status: p.status,
      scheduled: scheduledAt,
    });
  }

  if (!dryRun) {
    await prisma.$executeRaw`
      UPDATE platform_config
      SET "sundayWithdrawBatchAnchor" = ${firstDelivery},
          "sundayWithdrawBatchFinalizedAt" = NULL,
          "sundayWithdrawBatchScheduleNotifiedAt" = ${now}
      WHERE id = 'default'
    `;
  }

  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const lastSlot = rows[rows.length - 1].scheduled;
  const spanHours =
    (lastSlot.getTime() - firstDelivery.getTime()) / (60 * 60 * 1000);

  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #334155;">#${r.pos}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.name)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.email ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.net.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>${escapeHtml(formatKampalaWhen(r.scheduled))} EAT</strong><br><span style="color:#94a3b8;font-size:11px;">${escapeHtml(formatUtcWhen(r.scheduled))}</span></td>
        </tr>`,
    )
    .join('');

  const textLines = rows
    .map(
      (r) =>
        `#${r.pos} ${r.name} (${r.email ?? '—'}) net $${r.net.toFixed(2)} @ ${formatKampalaWhen(r.scheduled)} EAT [${r.status}]`,
    )
    .join('\n');

  const subject = `Withdrawal dispatch — updated schedule (${rows.length} payouts, $${totalNet.toFixed(2)} USDT)`;

  let emailSent = false;
  if (!dryRun) {
    if (!resendKey) throw new Error('RESEND_API_KEY not set');

    const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
<div style="max-width:900px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
<h1 style="color:#fff;font-size:20px">Withdrawal dispatch schedule</h1>
<p>Batch: <strong>${rows.length} payouts</strong> · net total <strong>$${totalNet.toFixed(2)} USDT</strong></p>
<p><strong>First delivery:</strong> ${formatKampalaWhen(firstDelivery)} EAT<br>
<strong>Last delivery:</strong> ${formatKampalaWhen(lastSlot)} EAT<br>
<strong>Interval:</strong> ~${intervalMinutes.toFixed(1)} minutes between payouts (${spanHours.toFixed(1)} hour window).</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
<thead><tr style="color:#94a3b8;text-align:left">
<th style="padding:8px">#</th><th style="padding:8px">User</th><th style="padding:8px">Email</th>
<th style="padding:8px">Net USDT</th><th style="padding:8px">Scheduled (EAT)</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
<p style="color:#94a3b8;font-size:12px;margin-top:16px">Prepared ${formatKampalaWhen(now)} EAT</p>
</div></body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [adminEmail],
        subject,
        html,
        text: `Withdrawal dispatch schedule (${rows.length} payouts, $${totalNet.toFixed(2)} net USDT)\nFirst: ${formatKampalaWhen(firstDelivery)} EAT\nLast: ${formatKampalaWhen(lastSlot)} EAT\nInterval: ~${intervalMinutes.toFixed(1)} min\n\n${textLines}`,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);
    emailSent = true;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        count: rows.length,
        totalNetUsdt: totalNet.toFixed(2),
        firstDeliveryEat: formatKampalaWhen(firstDelivery),
        lastDeliveryEat: formatKampalaWhen(lastSlot),
        intervalMinutes: intervalMinutes.toFixed(1),
        adminEmail,
        emailSent,
        emailSubject: dryRun ? null : subject,
        schedule: rows.map((r) => ({
          pos: r.pos,
          name: r.name,
          email: r.email,
          net: r.net.toFixed(2),
          scheduledEat: formatKampalaWhen(r.scheduled),
          scheduledUtc: formatUtcWhen(r.scheduled),
          status: r.status,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
