/**
 * Reject all PENDING loans and warn traders with no deposit / no investment
 * that they will be banned in 24 hours if they do not fund.
 *
 * Usage: cd backend && npx tsx scripts/deny-loans-and-warn-unfunded.ts
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
const apiKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Tradeguard <info@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const DEADLINE_LABEL = 'Friday 14 August 2026, 1:00 PM Africa/Kampala (24 hours)';
const LOAN_REASON =
  'Loan requests are closed. Deposit USDT and allocate to Smart Invest instead.';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">${escapeHtml(title)}</h1>
    ${body}
  </div></body></html>`;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
  if (!apiKey) throw new Error('RESEND_API_KEY missing');
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return;
      lastErr = `Resend ${res.status}: ${await res.text()}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(lastErr);
}

async function rejectPendingLoans() {
  const pending = await prisma.loan.findMany({
    where: { status: 'PENDING' },
    include: { user: { select: { email: true, displayName: true } } },
  });
  const rejected: string[] = [];
  for (const loan of pending) {
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: ADMIN_ID,
        rejectedReason: LOAN_REASON,
      },
    });
    const email = loan.user.email?.trim().toLowerCase();
    const name = loan.user.displayName || 'there';
    if (email) {
      const term = String(loan.term);
      const principal = Number(loan.principal);
      const html = layout(
        'Loan request declined',
        `<p>Hi ${escapeHtml(name)},</p>
        <p>Your <strong>${escapeHtml(term)}</strong> loan request ($${principal.toFixed(2)} USDT) was declined.</p>
        <p><strong>Reason:</strong> ${escapeHtml(LOAN_REASON)}</p>
        <p><a href="${frontendUrl}/invest" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open Smart Invest</a></p>`,
      );
      await sendEmail(
        email,
        `Loan declined — ${term}`,
        html,
        `Your ${term} loan request ($${principal.toFixed(2)}) was declined. ${LOAN_REASON}`,
      );
    }
    rejected.push(`${loan.id} ${email ?? loan.userId} $${Number(loan.principal).toFixed(2)}`);
    console.log(`rejected loan ${loan.id}`);
  }
  return rejected;
}

async function warnUnfunded() {
  const investedIds = new Set<string>();
  const wallets = await prisma.platformWallet.findMany({
    where: {
      OR: [{ investorBalance: { gt: 0.5 } }, { unitrustBalance: { gt: 0.5 } }],
    },
    select: { userId: true },
  });
  for (const w of wallets) investedIds.add(w.userId);
  const vaults = await prisma.chainVaultPosition.findMany({
    where: {
      OR: [{ principalBalance: { gt: 0.5 } }, { profitBalance: { gt: 0.5 } }],
    },
    select: { userId: true },
  });
  for (const v of vaults) investedIds.add(v.userId);

  const users = await prisma.user.findMany({
    where: {
      role: 'TRADER',
      status: { notIn: ['BANNED', 'SUSPENDED'] },
      email: { not: null },
      ...(investedIds.size
        ? { id: { notIn: [...investedIds] } }
        : {}),
    },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  });

  let sent = 0;
  let failed = 0;
  for (const user of users) {
    const email = user.email?.trim().toLowerCase();
    if (!email) continue;
    const name = user.displayName || 'there';
    const html = layout(
      'Final warning: deposit and invest within 24 hours',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>Your TraderRank Pro account has <strong>no deposit</strong> and <strong>no investment</strong>.</p>
      <p><strong>You have 24 hours</strong> — until <strong>${escapeHtml(DEADLINE_LABEL)}</strong> — to deposit USDT and allocate it to Smart Invest.</p>
      <p>If you do not fund your account by that deadline:</p>
      <ul>
        <li>Your account will be <strong>permanently banned</strong>.</li>
        <li>You will <strong>not be allowed to register again</strong> with this email or a new account.</li>
      </ul>
      <p>Deposit now, then open Smart Invest and allocate funds.</p>
      <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;margin-right:8px">Deposit</a>
      <a href="${frontendUrl}/invest" style="display:inline-block;background:#1e3a8a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Smart Invest</a></p>`,
    );
    const text = `Final warning: your account has no deposit and no investment. Deposit and allocate to Smart Invest within 24 hours (deadline ${DEADLINE_LABEL}) or you will be permanently banned and cannot register again. ${frontendUrl}/wallet`;
    try {
      await sendEmail(
        email,
        'Final warning: fund your account within 24 hours or you will be banned',
        html,
        text,
      );
      sent++;
      console.log(`warned ${email}`);
    } catch (err) {
      failed++;
      console.error(`failed ${email}`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return { total: users.length, sent, failed };
}

async function notifyRecentlyRejected() {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const rows = await prisma.loan.findMany({
    where: { status: 'REJECTED', reviewedAt: { gte: since } },
    include: { user: { select: { email: true, displayName: true } } },
  });
  for (const loan of rows) {
    const email = loan.user.email?.trim().toLowerCase();
    if (!email) continue;
    const name = loan.user.displayName || 'there';
    const term = String(loan.term);
    const principal = Number(loan.principal);
    const reason = loan.rejectedReason || LOAN_REASON;
    const html = layout(
      'Loan request declined',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>Your <strong>${escapeHtml(term)}</strong> loan request ($${principal.toFixed(2)} USDT) was declined.</p>
      <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
      <p><a href="${frontendUrl}/invest" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open Smart Invest</a></p>`,
    );
    await sendEmail(
      email,
      `Loan declined — ${term}`,
      html,
      `Your ${term} loan request ($${principal.toFixed(2)}) was declined. ${reason}`,
    );
    console.log(`loan-decline emailed ${email}`);
  }
}

async function waitForResend(maxMs = 25 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: ['invalid@example.com'],
          subject: 'ping',
        }),
        signal: AbortSignal.timeout(15000),
      });
      // 401/403/422 means API is reachable; 5xx / 530 is still down
      if (res.status < 500) {
        console.log(`resend reachable status=${res.status}`);
        return;
      }
      console.log(`resend still down status=${res.status}`);
    } catch (err) {
      console.log(
        `resend wait: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error('Resend still unreachable after wait');
}

async function main() {
  await waitForResend();
  const rejected = await rejectPendingLoans();
  if (rejected.length === 0) {
    try {
      await notifyRecentlyRejected();
    } catch (err) {
      console.error(
        'loan decline email failed',
        err instanceof Error ? err.message : err,
      );
    }
  }
  const warn = await warnUnfunded();
  console.log(
    JSON.stringify(
      {
        loansRejected: rejected,
        unfundedWarning: warn,
        deadline: DEADLINE_LABEL,
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
