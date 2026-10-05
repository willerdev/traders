/**
 * Reschedule active Sunday withdraw batch evenly between fixed EAT window, then email admin.
 * Optionally add unscheduled PENDING payouts (inserted in the middle of existing order).
 * Idempotent: re-run with same env vars reproduces the same schedule.
 *
 * Usage:
 *   cd backend && npx tsx scripts/schedule-sunday-batch-mon-tue-window.ts
 *
 * Env (optional overrides):
 *   FIRST_DELIVERY_UTC=2026-09-07T15:00:00.000Z   Mon 18:00 EAT
 *   LAST_DELIVERY_UTC=2026-09-08T06:00:00.000Z    Tue 09:00 EAT
 *   INSERT_EMAILS=fizzlerose1derrick@gmail.com,erukundo181@gmail.com
 *   INSERT_AFTER=6                                  insert after N existing (positions N+1…)
 *   ADMIN_EMAIL=willeratmit12@gmail.com
 *   DRY_RUN=1                                       preview only, no DB/email
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
const insertEmails = (process.env.INSERT_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const insertAfter = process.env.INSERT_AFTER
  ? Number(process.env.INSERT_AFTER)
  : null;

/** Mon 7 Sep 2026 18:00 EAT = 15:00 UTC */
const FIRST_DELIVERY_UTC =
  process.env.FIRST_DELIVERY_UTC || '2026-09-07T15:00:00.000Z';
/** Tue 8 Sep 2026 09:00 EAT = 06:00 UTC */
const LAST_DELIVERY_UTC =
  process.env.LAST_DELIVERY_UTC || '2026-09-08T06:00:00.000Z';

/** Normal Sunday batch: first hourly slot ~03:10 EAT Mon after anchor (for delay copy). */
const NORMAL_FIRST_EAT = 'Mon 7 Sep 2026, 03:10 EAT';
const NORMAL_LAST_EAT = 'Mon 7 Sep 2026, 14:10 EAT';

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

function parseOriginalNet(notes: string | null, traderShare: number) {
  const m = (notes || '').match(/Sunday batch 9% adjustment: net \$([0-9.]+)/);
  return m ? Number(m[1]) : traderShare;
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
    .trim();
}

function hasBatchAdjustment(notes: string | null) {
  return /Sunday batch (9% adjustment|VVIP waiver)/.test(notes ?? '');
}

function mergePayoutOrder(
  existing: PayoutRow[],
  inserts: PayoutRow[],
  afterCount: number,
): PayoutRow[] {
  const cut = Math.max(0, Math.min(afterCount, existing.length));
  return [
    ...existing.slice(0, cut),
    ...inserts,
    ...existing.slice(cut),
  ];
}

async function fetchScheduledBatch(dayStart: Date): Promise<PayoutRow[]> {
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

async function fetchUnscheduledAdds(
  emails: string[],
  excludeIds: Set<string>,
): Promise<PayoutRow[]> {
  if (emails.length === 0) return [];
  const exclude = [...excludeIds];
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
      AND p."scheduledApproveAt" IS NULL
      AND LOWER(u.email) = ANY(${emails}::text[])
      AND NOT (p.id = ANY(${exclude}::text[]))
    ORDER BY p."requestedAt" ASC
  `;
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

  const scheduled = await fetchScheduledBatch(dayStart);
  const scheduledIds = new Set(scheduled.map((p) => p.id));
  const scheduledEmails = new Set(
    scheduled.map((p) => (p.email ?? '').toLowerCase()).filter(Boolean),
  );
  const emailsToAdd = insertEmails.filter((e) => !scheduledEmails.has(e));
  const adds =
    emailsToAdd.length > 0
      ? await fetchUnscheduledAdds(emailsToAdd, scheduledIds)
      : [];

  if (emailsToAdd.length > 0 && adds.length !== emailsToAdd.length) {
    const found = new Set(adds.map((p) => (p.email ?? '').toLowerCase()));
    const missing = emailsToAdd.filter((e) => !found.has(e));
    throw new Error(`INSERT_EMAILS not found or not eligible: ${missing.join(', ')}`);
  }

  const afterCount =
    insertAfter ?? Math.floor(scheduled.length / 2);
  const payouts = mergePayoutOrder(scheduled, adds, afterCount);

  if (payouts.length === 0) {
    throw new Error('No PENDING Sunday batch payouts found');
  }

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
    gross: number;
    originalNet: number;
    net: number;
    wallet: string;
    status: string;
    scheduled: Date;
    inserted: boolean;
    vvipWaiver: boolean;
  };

  const rows: Row[] = [];
  const insertedIds = new Set(adds.map((p) => p.id));

  for (let i = 0; i < payouts.length; i++) {
    const p = payouts[i];
    const scheduledAt = slots[i];
    const gross = Number(p.virtualProfit);
    let net = Number(p.traderShare);
    const originalNet = parseOriginalNet(p.notes, net);
    const adj = batchAdjustmentUpdate(p);
    const vvipWaiver = Boolean(adj?.noteSuffix.includes('VVIP waiver'));
    if (adj) net = adj.traderShare;

    const rescheduleNote = `Custom dispatch window ${formatKampalaDateTime(scheduledAt)} Kampala (even spread Mon 18:00 → Tue 09:00 EAT)`;
    const baseNotes = stripPriorRescheduleNotes(p.notes);
    const notes = [
      baseNotes,
      adj?.noteSuffix,
      rescheduleNote,
    ]
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
      gross,
      originalNet,
      net,
      wallet: p.walletAddress!,
      status: p.status,
      scheduled: scheduledAt,
      inserted: insertedIds.has(p.id),
      vvipWaiver,
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

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const spanHours =
    (lastDelivery.getTime() - firstDelivery.getTime()) / (60 * 60 * 1000);
  const delayFirstHours = 14 + 50 / 60;
  const delayLastHours = 18 + 50 / 60;

  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #334155;">#${r.pos}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.name)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.email ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.net.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>${escapeHtml(formatKampalaWhen(r.scheduled))} EAT</strong><br><span style="color:#94a3b8;font-size:11px;">${escapeHtml(formatUtcWhen(r.scheduled))}</span></td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${r.status}</td>
        </tr>`,
    )
    .join('');

  const textLines = rows
    .map(
      (r) =>
        `#${r.pos} ${r.name} (${r.email ?? '—'}) net $${r.net.toFixed(2)} @ ${formatKampalaWhen(r.scheduled)} EAT / ${formatUtcWhen(r.scheduled)} [${r.status}]`,
    )
    .join('\n');

  const insertedRows = rows.filter((r) => r.inserted);
  const subject = `[Sunday batch] ${rows.length} withdrawals — $${totalNet.toFixed(2)} USDT · Mon 18:00 → Tue 09:00 EAT`;

  let emailSent = false;
  if (!dryRun) {
    if (!resendKey) throw new Error('RESEND_API_KEY not set');

    const insertedNote =
      insertedRows.length > 0
        ? `<p style="color:#cbd5e1;font-size:13px;">Added to batch (middle insert): ${insertedRows.map((r) => `<strong>${escapeHtml(r.name)}</strong> (#${r.pos})`).join(', ')}.</p>`
        : '';

    const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
<div style="max-width:900px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
<h1 style="color:#fff;font-size:20px">Sunday withdrawal dispatch — custom window</h1>
<p>Batch: <strong>${rows.length} payouts</strong> · net total <strong>$${totalNet.toFixed(2)} USDT</strong> (9% Sunday adjustment on standard withdrawals; VVIP waivers where noted).</p>
${insertedNote}
<p><strong>First delivery:</strong> ${formatKampalaWhen(firstDelivery)} EAT (${formatUtcWhen(firstDelivery)})<br>
<strong>Last delivery:</strong> ${formatKampalaWhen(lastDelivery)} EAT (${formatUtcWhen(lastDelivery)})<br>
<strong>Interval:</strong> ~${intervalMinutes.toFixed(1)} minutes between each payout (even spread over ${spanHours.toFixed(1)} hours).</p>
<div style="background:#0f172a;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #f59e0b">
<p style="margin:0 0 8px;color:#fbbf24;font-weight:600">Delay vs normal Sunday batch</p>
<p style="margin:0;font-size:13px;color:#cbd5e1">Normal Sunday batch delivers on <strong>hourly slots</strong> starting ~${NORMAL_FIRST_EAT} (first hour after Sunday UTC anchor), with the last of ${rows.length} payouts around <strong>${NORMAL_LAST_EAT}</strong>.</p>
<p style="margin:8px 0 0;font-size:13px;color:#cbd5e1">This dispatch is delayed: first payout <strong>~${delayFirstHours.toFixed(1)} hours later</strong> than normal (Mon 18:00 vs Mon 03:10 EAT), last payout <strong>~${delayLastHours.toFixed(1)} hours later</strong> (Tue 09:00 vs Mon 14:10 EAT). Cron auto-approves each payout when its slot is due.</p>
</div>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
<thead><tr style="color:#94a3b8;text-align:left">
<th style="padding:8px">#</th><th style="padding:8px">User</th><th style="padding:8px">Email</th>
<th style="padding:8px">Net USDT</th><th style="padding:8px">Scheduled (EAT)</th><th style="padding:8px">Status</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
<p style="color:#94a3b8;font-size:12px;margin-top:16px">Gross total: $${totalGross.toFixed(2)} · Prepared ${formatKampalaWhen(now)} EAT</p>
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
        text: `Sunday batch custom dispatch (${rows.length} payouts, $${totalNet.toFixed(2)} net USDT)\nFirst: ${formatKampalaWhen(firstDelivery)} EAT\nLast: ${formatKampalaWhen(lastDelivery)} EAT\nInterval: ~${intervalMinutes.toFixed(1)} min\n\nDelay vs normal: first ~${delayFirstHours.toFixed(1)}h late, last ~${delayLastHours.toFixed(1)}h late.\n\n${textLines}`,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);
    emailSent = true;
  }

  const summary = {
    ok: true,
    dryRun,
    count: rows.length,
    totalGross: totalGross.toFixed(2),
    totalNet: totalNet.toFixed(2),
    insertAfter: afterCount,
    addedCount: adds.length,
    addedEmails: adds.map((p) => p.email),
    firstDeliveryEat: formatKampalaWhen(firstDelivery),
    firstDeliveryUtc: formatUtcWhen(firstDelivery),
    lastDeliveryEat: formatKampalaWhen(lastDelivery),
    lastDeliveryUtc: formatUtcWhen(lastDelivery),
    intervalMinutes: intervalMinutes.toFixed(1),
    spanHours: spanHours.toFixed(1),
    delayExplanation: {
      normalFirstEat: NORMAL_FIRST_EAT,
      normalLastEat: NORMAL_LAST_EAT,
      delayFirstHours: delayFirstHours.toFixed(1),
      delayLastHours: delayLastHours.toFixed(1),
    },
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
      inserted: r.inserted,
      vvipWaiver: r.vvipWaiver,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
