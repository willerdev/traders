/**
 * Send admin schedule email for the active Sunday withdraw batch (one-off / repair).
 * Usage: cd backend && npx tsx scripts/send-sunday-batch-schedule-email.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { sundayUtcStart } from '../src/payouts/sunday-withdraw-batch.util';

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

async function main() {
  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
  });
  if (!config?.sundayWithdrawBatchAnchor) {
    throw new Error('No active Sunday batch anchor on platform config');
  }

  const dayStart = sundayUtcStart(config.sundayWithdrawBatchAnchor);
  const payouts = await prisma.payout.findMany({
    where: {
      source: 'DEPOSITOR',
      scheduledApproveAt: { not: null, gte: dayStart },
    },
    include: { user: { select: { displayName: true, email: true } } },
    orderBy: { scheduledApproveAt: 'asc' },
  });

  if (payouts.length === 0) {
    throw new Error('No scheduled payouts in active batch');
  }

  const rows = payouts.map((p, i) => {
    const m = (p.notes || '').match(/Sunday batch 9% adjustment: net \$([0-9.]+)/);
    return {
      pos: i + 1,
      name: p.user.displayName,
      email: p.user.email,
      original: m ? Number(m[1]) : Number(p.traderShare),
      adjusted: Number(p.traderShare),
      scheduled: p.scheduledApproveAt!,
      status: p.status,
    };
  });

  const total = rows.reduce((s, r) => s + r.adjusted, 0);
  const tableRows = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #334155;">#${r.pos}</td><td style="padding:8px;border-bottom:1px solid #334155;">${r.name}</td><td style="padding:8px;border-bottom:1px solid #334155;">${r.email ?? '—'}</td><td style="padding:8px;border-bottom:1px solid #334155;">$${r.original.toFixed(2)} → $${r.adjusted.toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #334155;"><strong>${formatKampalaWhen(r.scheduled)}</strong></td><td style="padding:8px;border-bottom:1px solid #334155;">${r.status}</td></tr>`,
    )
    .join('');

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', email: { not: null } },
    select: { email: true },
  });
  const recipients = [
    ...new Set([
      'willeratmit12@gmail.com',
      ...admins.map((a) => a.email!).filter(Boolean),
    ]),
  ];

  if (!resendKey) throw new Error('RESEND_API_KEY not set');

  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px"><div style="max-width:720px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px"><h1 style="color:#fff;font-size:20px">Sunday withdrawal batch schedule</h1><p>Today's batch: <strong>${rows.length} payouts</strong>, <strong>$${total.toFixed(2)} USDT</strong> net (9% adjustment). One payout per hour.</p><table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px"><thead><tr style="color:#94a3b8;text-align:left"><th style="padding:8px">#</th><th style="padding:8px">User</th><th style="padding:8px">Email</th><th style="padding:8px">Net</th><th style="padding:8px">Scheduled (Kampala)</th><th style="padding:8px">Status</th></tr></thead><tbody>${tableRows}</tbody></table></div></body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `[Sunday batch] ${rows.length} withdrawals scheduled — $${total.toFixed(2)} USDT`,
      html,
      text: `Sunday batch: ${rows.length} payouts scheduled, $${total.toFixed(2)} USDT net.`,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);

  await prisma.platformConfig.update({
    where: { id: 'default' },
    data: { sundayWithdrawBatchScheduleNotifiedAt: new Date() },
  });

  console.log(
    JSON.stringify({ ok: true, recipients, count: rows.length, total }, null, 2),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
