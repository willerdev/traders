/**
 * Mark Ely2020 (nelysa2020) $16.59 TRC20 payout PAID and email him.
 *
 * Usage: cd backend && npx tsx scripts/confirm-ely2020-1659-paid.ts
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

const prisma = new PrismaClient();
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const PAYOUT_ID = 'cmu9yvdgt4v4ynm01wmhk4lr9';
const EMAIL = 'nelysa2020@gmail.com';
const EXPECTED_NET = 16.59;
const EXPECTED_WALLET = 'TSA3GF51JnHbafbZxAMGtR6Qh8cVZQvTkg';
const SCHEDULED_LABEL = 'Sat, 26 Sept 2026, 20:15 (Africa/Kampala)';

const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const emailFrom =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  const probe = await prisma.user.findFirst({
    where: { email: 'nelysa2020@gmail.com' },
    select: { email: true },
  });
  if (!probe) {
    throw new Error('Wrong database — nelysa2020@gmail.com not found');
  }

  const payout = await prisma.payout.findUnique({
    where: { id: PAYOUT_ID },
    include: { user: { select: { id: true, email: true, displayName: true } } },
  });
  if (!payout) throw new Error(`Payout ${PAYOUT_ID} not found`);
  if (payout.user.email?.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${payout.user.email}`);
  }
  const net = Number(payout.traderShare);
  if (Math.abs(net - EXPECTED_NET) > 0.01) {
    throw new Error(`Amount mismatch: $${net}`);
  }
  const wallet = payout.walletAddress?.trim() ?? '';
  if (wallet !== EXPECTED_WALLET) {
    throw new Error(`Wallet mismatch: ${wallet}`);
  }
  if (payout.status === 'PAID') {
    console.log(JSON.stringify({ ok: true, skipped: 'already_paid' }));
    await prisma.$disconnect();
    return;
  }
  if (payout.status !== 'PENDING') {
    throw new Error(`Unexpected status: ${payout.status}`);
  }

  const now = new Date();
  const updated = await prisma.payout.update({
    where: { id: PAYOUT_ID },
    data: {
      status: 'PAID',
      processedAt: now,
      notes: `${payout.notes ?? ''} — Confirmed by admin ${ADMIN_ID} $${EXPECTED_NET} TRC20 ${EXPECTED_WALLET}`.trim(),
    },
  });

  const name = payout.user.displayName || 'Ely2020';
  const subject = `Withdrawal complete — $${EXPECTED_NET.toFixed(2)} USDT`;
  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">Withdrawal complete</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your Trade Guard withdrawal has been processed successfully.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
      <tr><td style="padding:6px 0;color:#94a3b8">Name</td><td style="padding:6px 0">${escapeHtml(name)}</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Email</td><td style="padding:6px 0">${escapeHtml(EMAIL)}</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Amount</td><td style="padding:6px 0"><strong>$${EXPECTED_NET.toFixed(2)} USDT</strong></td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Network</td><td style="padding:6px 0">TRC20</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Wallet</td><td style="padding:6px 0;font-family:monospace;font-size:12px;color:#93c5fd;word-break:break-all">${escapeHtml(EXPECTED_WALLET)}</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Scheduled</td><td style="padding:6px 0">${escapeHtml(SCHEDULED_LABEL)}</td></tr>
    </table>
    <p style="color:#94a3b8;font-size:14px;">Funds should appear in your wallet once the network confirms the transfer.</p>
    <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a></p>
  </div></body></html>`;
  const text = `Hi ${name}, your Trade Guard withdrawal of $${EXPECTED_NET.toFixed(2)} USDT (TRC20) to ${EXPECTED_WALLET} is complete. Scheduled ${SCHEDULED_LABEL}. ${frontendUrl}/wallet`;

  if (!resendKey) throw new Error('RESEND_API_KEY missing');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [EMAIL],
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Resend failed (${res.status}): ${await res.text()}`);
  }

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'ADMIN_ADJUSTMENT',
      targetId: payout.user.id,
      metadata: {
        source: 'confirm-ely2020-1659-paid',
        payoutId: PAYOUT_ID,
        after: {
          status: updated.status,
          processedAt: updated.processedAt?.toISOString() ?? null,
        },
        emailSent: true,
        emailSubject: subject,
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        payoutId: PAYOUT_ID,
        email: EMAIL,
        status: updated.status,
        net: EXPECTED_NET,
        wallet: EXPECTED_WALLET,
        emailSent: true,
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
