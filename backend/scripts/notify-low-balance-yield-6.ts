/**
 * Notify Smart Invest users whose daily yield was adjusted to 6% (low-balance tier).
 *
 * Usage: cd backend && npx tsx scripts/notify-low-balance-yield-6.ts
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

const DAILY_YIELD_PERCENT = 6;
const PREVIOUS_YIELD_PERCENT = 8;

const TARGETS = [
  { email: 'yvettemunezero922@gmail.com', label: 'Veve' },
  { email: 'nelysa2020@gmail.com', label: 'Ely2020' },
  { email: 'masnhoe@hotmail.com', label: 'Eric MASENGESHO' },
] as const;

const prisma = new PrismaClient();
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

function layout(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">${escapeHtml(title)}</h1>
    ${body}
  </div></body></html>`;
}

function button(href: string, label: string) {
  return `<p><a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!resendKey) throw new Error('RESEND_API_KEY missing');
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: emailFrom, to: [to], subject, html, text }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return true;
      lastErr = await res.text();
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 400));
  }
  throw new Error(lastErr);
}

const SUBJECT = `Smart Invest update — daily yield adjusted to ${DAILY_YIELD_PERCENT}%`;

async function main() {
  const results: Array<{
    label: string;
    email: string;
    emailSent: boolean;
    subject: string;
    error?: string;
    investorBalance?: number;
    walletBalance?: number;
  }> = [];

  for (const { email, label } of TARGETS) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        platformWallet: {
          select: { investorBalance: true, availableBalance: true },
        },
        investorSettings: { select: { dailyYieldPercent: true } },
      },
    });

    if (!user?.email) {
      results.push({
        label,
        email,
        emailSent: false,
        subject: SUBJECT,
        error: 'User not found',
      });
      continue;
    }

    const name = user.displayName || label;
    const investorBalance = Number(user.platformWallet?.investorBalance ?? 0);
    const walletBalance = Number(user.platformWallet?.availableBalance ?? 0);
    const storedYield =
      user.investorSettings?.dailyYieldPercent != null
        ? Number(user.investorSettings.dailyYieldPercent)
        : PREVIOUS_YIELD_PERCENT;

    const html = layout(
      'Smart Invest rate update',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>We are writing to confirm an update to your <strong>Smart Invest</strong> account.</p>
      <p>Your daily yield rate has been adjusted from <strong>${PREVIOUS_YIELD_PERCENT}%</strong> to <strong>${DAILY_YIELD_PERCENT}%</strong> on your invested balance. This rate applies to future weekday yield credits (Kampala time).</p>
      <p>Current balances:</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Smart Invest: <strong>$${investorBalance.toFixed(2)} USDT</strong></li>
        <li>Platform wallet: <strong>$${walletBalance.toFixed(2)} USDT</strong></li>
        <li>Daily yield rate: <strong>${storedYield}%</strong></li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">New allocations still follow the 24-hour yield hold before they earn daily yield. Weekend yield credits are not issued.</p>
      <p>If you have questions, reply to this email or contact Support from your account.</p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    );

    const text = `Hi ${name}, your Smart Invest daily yield rate has been adjusted from ${PREVIOUS_YIELD_PERCENT}% to ${DAILY_YIELD_PERCENT}%. Smart Invest balance: $${investorBalance.toFixed(2)} USDT. Platform wallet: $${walletBalance.toFixed(2)} USDT. Open ${frontendUrl}/invest`;

    try {
      const emailSent = await sendEmail(user.email, SUBJECT, html, text);
      results.push({
        label,
        email: user.email,
        emailSent,
        subject: SUBJECT,
        investorBalance,
        walletBalance,
      });
    } catch (err) {
      results.push({
        label,
        email: user.email,
        emailSent: false,
        subject: SUBJECT,
        error: err instanceof Error ? err.message : String(err),
        investorBalance,
        walletBalance,
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
