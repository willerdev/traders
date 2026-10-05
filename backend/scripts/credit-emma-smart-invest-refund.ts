/**
 * Follow-up (run ~24h after deny-emma-withdraw-reschedule.ts):
 * Credit $166 Smart Invest refund to EMMA platform wallet.
 *
 * Usage: cd backend && npx tsx scripts/credit-emma-smart-invest-refund.ts
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
const USER_ID = 'cms7wxc4g08u2ke01n7ineqld';
const EMAIL = 'etuyizere64@gmail.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const REFUND_USD = 166;
const REFERENCE_ID = 'emma_smart_invest_refund_2026-08-28';

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

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!resendKey) throw new Error('RESEND_API_KEY missing');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: emailFrom, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

async function main() {
  const existing = await prisma.walletTransaction.findFirst({
    where: { referenceId: REFERENCE_ID },
  });
  if (existing) {
    console.log(JSON.stringify({ skipped: true, reason: 'already_credited' }, null, 2));
    return;
  }

  const balance = await prisma.$transaction(async (tx) => {
    const wallet = await tx.platformWallet.upsert({
      where: { userId: USER_ID },
      create: { userId: USER_ID },
      update: {},
    });
    const newBalance =
      Math.round((Number(wallet.availableBalance) + REFUND_USD) * 100) / 100;

    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: newBalance },
    });
    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: REFUND_USD,
        type: 'ADJUSTMENT',
        referenceId: REFERENCE_ID,
        description: `Smart Invest earning refund — $${REFUND_USD.toFixed(2)} USDT (scheduled 24h after withdrawal denial)`,
        balanceAfter: newBalance,
      },
    });

    return newBalance;
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'ADMIN_ADJUSTMENT',
      targetId: USER_ID,
      metadata: {
        source: 'credit-emma-smart-invest-refund',
        amount: REFUND_USD,
        balance,
      },
    },
  });

  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px"><div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px"><h1 style="color:#fff;font-size:20px">Smart Invest refund credited</h1><p>Hi EMMA,</p><p>As promised, <strong>$${REFUND_USD.toFixed(2)} USDT</strong> from your Smart Invest earning has been credited to your platform wallet.</p><p>New available balance: <strong>$${balance.toFixed(2)} USDT</strong></p><p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a></p></div></body></html>`;

  const emailSent = await sendEmail(
    EMAIL,
    `Smart Invest refund credited — $${REFUND_USD.toFixed(2)} USDT`,
    html,
    `Your Smart Invest refund of $${REFUND_USD.toFixed(2)} USDT has been credited. Balance: $${balance.toFixed(2)} USDT.`,
  );

  console.log(JSON.stringify({ credited: REFUND_USD, balance, emailSent }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
