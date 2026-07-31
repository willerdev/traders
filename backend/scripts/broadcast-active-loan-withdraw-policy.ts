/**
 * Lightweight one-shot (no full Nest app): email open-loan borrowers.
 * Usage: cd backend && npx tsx scripts/broadcast-active-loan-withdraw-policy.ts
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
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

function layout(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">${escapeHtml(title)}</h1>
    ${body}
  </div></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!apiKey) throw new Error('RESEND_API_KEY missing');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }
}

async function backfill() {
  const loans = await prisma.loan.findMany({
    where: { status: 'APPROVED', withdrawnAgainstLoan: 0 },
    select: {
      id: true,
      userId: true,
      principal: true,
      approvedAt: true,
      createdAt: true,
    },
  });
  for (const loan of loans) {
    const since = loan.approvedAt ?? loan.createdAt;
    const agg = await prisma.walletTransaction.aggregate({
      where: {
        userId: loan.userId,
        type: 'DEPOSITOR_WITHDRAW',
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    });
    const withdrawnAbs = Math.abs(Number(agg._sum.amount ?? 0));
    if (withdrawnAbs <= 0) continue;
    const principal = Number(loan.principal);
    const credited = Math.min(principal, Math.round(withdrawnAbs * 100) / 100);
    await prisma.loan.update({
      where: { id: loan.id },
      data: { withdrawnAgainstLoan: credited },
    });
  }
}

async function main() {
  await backfill();

  const loans = await prisma.loan.findMany({
    where: { status: 'APPROVED' },
    select: {
      userId: true,
      term: true,
      principal: true,
      totalDue: true,
      withdrawnAgainstLoan: true,
      user: { select: { email: true, displayName: true, status: true } },
    },
    orderBy: { approvedAt: 'asc' },
  });

  const seen = new Set<string>();
  let sent = 0;
  let failed = 0;
  let total = 0;

  for (const loan of loans) {
    const email = loan.user.email?.trim();
    if (!email || loan.user.status === 'BANNED') continue;
    if (seen.has(loan.userId)) continue;
    seen.add(loan.userId);
    total++;

    const principal = Number(loan.principal);
    const withdrawn = Number(loan.withdrawnAgainstLoan ?? 0);
    const remaining = Math.max(0, Math.round((principal - withdrawn) * 100) / 100);
    const name = loan.user.displayName || 'there';
    const term = String(loan.term);
    const totalDue = Number(loan.totalDue);

    const html = layout(
      'Loan update: withdrawals limited until you repay',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>You currently have an open <strong>${escapeHtml(term)}</strong> loan.</p>
      <p><strong>New rule:</strong> until the loan is repaid, you may only withdraw the loan advance — not other wallet balances or earnings.</p>
      <ul>
        <li>Loan advance: <strong>$${principal.toFixed(2)} USDT</strong></li>
        <li>Still withdrawable from this advance: <strong>$${remaining.toFixed(2)} USDT</strong></li>
        <li>Amount to repay: <strong>$${totalDue.toFixed(2)} USDT</strong></li>
      </ul>
      <p>After you repay, full withdrawals unlock again.</p>
      <p><a href="${frontendUrl}/loans" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">View / repay loan</a></p>`,
    );
    const text = `Open ${term} loan: until you repay $${totalDue.toFixed(2)}, you may only withdraw the loan advance ($${principal.toFixed(2)}; $${remaining.toFixed(2)} left). Repay at ${frontendUrl}/loans`;

    try {
      await sendEmail(
        email.toLowerCase(),
        'Loan open: only the loan advance can be withdrawn until you repay',
        html,
        text,
      );
      sent++;
      console.log(`sent ${email}`);
    } catch (err) {
      failed++;
      console.error(`failed ${email}`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  const announcedAt = new Date();
  await prisma.platformConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      activeLoanWithdrawPolicyAnnouncedAt: announcedAt,
    },
    update: { activeLoanWithdrawPolicyAnnouncedAt: announcedAt },
  });

  console.log(JSON.stringify({ total, sent, failed, announcedAt }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
