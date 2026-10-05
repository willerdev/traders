/**
 * Reschedule today's Sunday withdraw batch with custom start + interval, then email admin.
 *
 * Usage:
 *   cd backend && npx tsx scripts/reschedule-sunday-batch-delivery.ts
 *
 * Env overrides (optional):
 *   START_OFFSET_HOURS=5        — first payout this many hours from script run
 *   INTERVAL_MINUTES=90         — gap between each auto-delivery
 *   ADMIN_EMAIL=willeratmit12@gmail.com
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
const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const adminEmail =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const startOffsetHours = Number(process.env.START_OFFSET_HOURS ?? 5);
const intervalMinutes = Number(process.env.INTERVAL_MINUTES ?? 90);
const intervalMs = intervalMinutes * 60 * 1000;

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

async function main() {
  const now = new Date();
  const dayStart = sundayUtcStart(now);
  const dayEnd = sundayUtcEnd(now);

  const payouts = await prisma.payout.findMany({
    where: {
      status: 'PENDING',
      source: 'DEPOSITOR',
      walletAddress: { not: null },
      payoutMethod: { not: 'MOBILE_MONEY' },
      requestedAt: { gte: dayStart, lte: dayEnd },
      momoP2p: { is: null },
    },
    include: { user: { select: { displayName: true, email: true } } },
    orderBy: { requestedAt: 'asc' },
  });

  if (payouts.length === 0) {
    throw new Error('No PENDING Sunday batch payouts found for today');
  }

  const batchStart = new Date(now.getTime() + startOffsetHours * 60 * 60 * 1000);
  let slot = batchStart.getTime();

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
  };

  const rows: Row[] = [];

  for (let i = 0; i < payouts.length; i++) {
    const p = payouts[i];
    const scheduled = new Date(slot);
    slot += intervalMs;

    const gross = Number(p.virtualProfit);
    const net = Number(p.traderShare);
    const originalNet = parseOriginalNet(p.notes, net);

    const rescheduleNote = `Rescheduled auto-delivery ${formatKampalaDateTime(scheduled)} Kampala (${intervalMinutes} min interval)`;
    const notes = `${(p.notes ?? '').replace(/\s*— Rescheduled auto-delivery.*$/g, '').trim()} — ${rescheduleNote}`.trim();

    await prisma.payout.update({
      where: { id: p.id },
      data: {
        scheduledApproveAt: scheduled,
        notes,
      },
    });

    rows.push({
      pos: i + 1,
      payoutId: p.id,
      name: p.user.displayName,
      email: p.user.email,
      gross,
      originalNet,
      net,
      wallet: p.walletAddress!,
      status: p.status,
      scheduled,
    });
  }

  await prisma.platformConfig.update({
    where: { id: 'default' },
    data: {
      sundayWithdrawBatchAnchor: batchStart,
      sundayWithdrawBatchFinalizedAt: null,
      sundayWithdrawBatchScheduleNotifiedAt: new Date(),
    },
  });

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const firstDelivery = rows[0].scheduled;
  const lastDelivery = rows[rows.length - 1].scheduled;
  const spanHours =
    (lastDelivery.getTime() - firstDelivery.getTime()) / (60 * 60 * 1000);

  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #334155;">#${r.pos}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.name)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.email ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.gross.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.originalNet.toFixed(2)} → $${r.net.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;font-family:monospace;font-size:11px;">${escapeHtml(r.wallet.slice(0, 8))}…</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>${escapeHtml(formatKampalaWhen(r.scheduled))}</strong><br><span style="color:#94a3b8;font-size:11px;">${escapeHtml(formatUtcWhen(r.scheduled))}</span></td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${r.status}</td>
        </tr>`,
    )
    .join('');

  const textLines = rows
    .map(
      (r) =>
        `#${r.pos} ${r.name} (${r.email ?? '—'}) gross $${r.gross.toFixed(2)} net $${r.net.toFixed(2)} wallet ${r.wallet} @ ${formatKampalaWhen(r.scheduled)} EAT / ${formatUtcWhen(r.scheduled)} [${r.status}]`,
    )
    .join('\n');

  if (!resendKey) throw new Error('RESEND_API_KEY not set');

  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
<div style="max-width:900px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
<h1 style="color:#fff;font-size:20px">Sunday withdrawal auto-delivery schedule</h1>
<p>Today's Sunday batch: <strong>${rows.length} payouts</strong> · gross <strong>$${totalGross.toFixed(2)}</strong> · net <strong>$${totalNet.toFixed(2)} USDT</strong> (9% batch adjustment already applied).</p>
<p>Auto-delivery starts <strong>${formatKampalaWhen(firstDelivery)} EAT</strong> (${formatUtcWhen(firstDelivery)}), <strong>${intervalMinutes} minutes</strong> between each payout. Cron approves and sends when each slot is due.</p>
<p style="color:#94a3b8;font-size:13px;">First: ${formatKampalaWhen(firstDelivery)} EAT · Last: ${formatKampalaWhen(lastDelivery)} EAT · Span: ${spanHours.toFixed(1)} hours</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
<thead><tr style="color:#94a3b8;text-align:left">
<th style="padding:8px">#</th><th style="padding:8px">User</th><th style="padding:8px">Email</th>
<th style="padding:8px">Gross</th><th style="padding:8px">Net (9% adj.)</th><th style="padding:8px">Wallet</th>
<th style="padding:8px">Scheduled delivery</th><th style="padding:8px">Status</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
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
      subject: `[Sunday batch] ${rows.length} withdrawals auto-delivery — $${totalNet.toFixed(2)} USDT (every ${intervalMinutes}m)`,
      html,
      text: `Sunday batch auto-delivery schedule (${rows.length} payouts, $${totalNet.toFixed(2)} net)\nStart: ${formatKampalaWhen(firstDelivery)} EAT\nInterval: ${intervalMinutes} min\n\n${textLines}`,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);

  const summary = {
    ok: true,
    scope: 'today_sunday_batch_only',
    count: rows.length,
    totalGross: totalGross.toFixed(2),
    totalNet: totalNet.toFixed(2),
    startOffsetHours,
    intervalMinutes,
    firstDeliveryEat: formatKampalaWhen(firstDelivery),
    firstDeliveryUtc: formatUtcWhen(firstDelivery),
    lastDeliveryEat: formatKampalaWhen(lastDelivery),
    lastDeliveryUtc: formatUtcWhen(lastDelivery),
    spanHours: spanHours.toFixed(1),
    adminEmail,
    schedule: rows.map((r) => ({
      pos: r.pos,
      name: r.name,
      email: r.email,
      gross: r.gross.toFixed(2),
      net: r.net.toFixed(2),
      wallet: r.wallet,
      status: r.status,
      scheduledEat: formatKampalaWhen(r.scheduled),
      scheduledUtc: formatUtcWhen(r.scheduled),
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
