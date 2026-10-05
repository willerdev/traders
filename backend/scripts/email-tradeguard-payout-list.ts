/**
 * Trade Guard only: email the current open payout list to admin.
 *
 * Usage: cd backend && npx tsx scripts/email-tradeguard-payout-list.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

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
const SENT_PATH = resolve(__dirname, '.sent-tradeguard-payout-list.json');

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatKampalaWhen(date: Date | null) {
  if (!date) return '—';
  return date.toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

async function main() {
  const probe = await prisma.user.findFirst({
    where: { email: 'nelysa2020@gmail.com' },
    select: { email: true },
  });
  if (!probe) {
    throw new Error(
      'nelysa2020@gmail.com not found — refusing to send (wrong database?)',
    );
  }

  const payouts = await prisma.payout.findMany({
    where: { status: { in: ['PENDING', 'APPROVED'] } },
    include: { user: { select: { displayName: true, email: true } } },
    orderBy: [{ status: 'asc' }, { scheduledApproveAt: 'asc' }, { requestedAt: 'asc' }],
  });

  const pending = payouts.filter((p) => p.status === 'PENDING');
  const approved = payouts.filter((p) => p.status === 'APPROVED');
  const pendingTotal = pending.reduce((s, p) => s + Number(p.traderShare), 0);
  const approvedTotal = approved.reduce((s, p) => s + Number(p.traderShare), 0);

  function rowsHtml(
    rows: typeof payouts,
    start = 1,
  ) {
    return rows
      .map((p, i) => {
        const net = Number(p.traderShare);
        const wallet = p.walletAddress?.trim() || '—';
        return `<tr>
          <td style="padding:8px;border-bottom:1px solid #334155;">#${start + i}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(p.user.displayName)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(p.user.email ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>$${money(net)}</strong></td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(p.source)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(p.payoutMethod ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;font-family:monospace;font-size:11px;">${escapeHtml(wallet)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(formatKampalaWhen(p.scheduledApproveAt))}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(p.status)}</td>
        </tr>`;
      })
      .join('');
  }

  const textLines = (rows: typeof payouts) =>
    rows
      .map(
        (p, i) =>
          `#${i + 1} ${p.user.displayName} (${p.user.email ?? '—'}) $${Number(p.traderShare).toFixed(2)} ${p.source} ${p.payoutMethod ?? ''} ${p.walletAddress ?? ''} ${formatKampalaWhen(p.scheduledApproveAt)} ${p.status}`,
      )
      .join('\n');

  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
<div style="max-width:1100px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
<h1 style="color:#fff;font-size:20px">Trade Guard payout list</h1>
<p>Open withdrawals as of ${escapeHtml(formatKampalaWhen(new Date()))} Africa/Kampala.</p>
<p><strong>${pending.length} PENDING</strong> · $${money(pendingTotal)} USDT net &nbsp;·&nbsp; <strong>${approved.length} APPROVED</strong> (not marked paid) · $${money(approvedTotal)} USDT net</p>
<h2 style="color:#fff;font-size:16px;margin-top:24px">Pending</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="color:#94a3b8;text-align:left">
<th style="padding:8px">#</th><th style="padding:8px">User</th><th style="padding:8px">Email</th>
<th style="padding:8px">Net</th><th style="padding:8px">Source</th><th style="padding:8px">Method</th>
<th style="padding:8px">Wallet</th><th style="padding:8px">Scheduled (Kampala)</th><th style="padding:8px">Status</th>
</tr></thead>
<tbody>${rowsHtml(pending)}</tbody>
</table>
<h2 style="color:#fff;font-size:16px;margin-top:24px">Approved (not paid)</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="color:#94a3b8;text-align:left">
<th style="padding:8px">#</th><th style="padding:8px">User</th><th style="padding:8px">Email</th>
<th style="padding:8px">Net</th><th style="padding:8px">Source</th><th style="padding:8px">Method</th>
<th style="padding:8px">Wallet</th><th style="padding:8px">Scheduled (Kampala)</th><th style="padding:8px">Status</th>
</tr></thead>
<tbody>${rowsHtml(approved)}</tbody>
</table>
</div></body></html>`;

  if (!resendKey) throw new Error('RESEND_API_KEY missing');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [adminEmail],
      subject: `[Trade Guard] Payout list — ${pending.length} pending ($${pendingTotal.toFixed(2)}) + ${approved.length} approved`,
      html,
      text: `Trade Guard payout list\nPENDING ${pending.length} $${pendingTotal.toFixed(2)}\n${textLines(pending)}\n\nAPPROVED ${approved.length} $${approvedTotal.toFixed(2)}\n${textLines(approved)}`,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);

  writeFileSync(
    SENT_PATH,
    JSON.stringify(
      {
        sentAt: new Date().toISOString(),
        adminEmail,
        pending: pending.length,
        pendingTotal,
        approved: approved.length,
        approvedTotal,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        to: adminEmail,
        pending: pending.length,
        pendingTotal: pendingTotal.toFixed(2),
        approved: approved.length,
        approvedTotal: approvedTotal.toFixed(2),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
