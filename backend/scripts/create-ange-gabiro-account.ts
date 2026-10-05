/**
 * Create Trade Guard account for Ange Gabiro, 8% Smart Invest yield,
 * email login details + forgot-password reminder.
 *
 * Usage: cd backend && npx tsx scripts/create-ange-gabiro-account.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
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
const frontendUrl = 'https://thetradeguard.com';

const EMAIL = 'angegabirohirwa@gmail.com';
const DISPLAY_NAME = 'Ange Gabiro';
const DAILY_YIELD_PERCENT = 8;
const SENT_PATH = resolve(__dirname, '.sent-create-ange-gabiro-account.json');

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tempPassword() {
  const chunk = randomBytes(5)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8);
  return `AngeG-${chunk}9!`;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
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
        body: JSON.stringify({ from, to: [to], subject, html, text }),
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

async function main() {
  const probe = await prisma.user.findFirst({
    where: { email: 'nelysa2020@gmail.com' },
    select: { id: true },
  });
  if (!probe) {
    throw new Error('Wrong database (nelysa2020 missing) — abort');
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
  });
  if (existing) {
    throw new Error(`Account already exists: ${existing.id}`);
  }

  const password = tempPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const referralCode = randomBytes(4).toString('hex').toUpperCase();
  const now = new Date();

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash,
      displayName: DISPLAY_NAME,
      role: 'TRADER',
      status: 'ACTIVE',
      emailVerified: true,
      registrationPaid: true,
      termsAcceptedAt: now,
      referralCode,
      investorActive: true,
      investorEnrolledAt: now,
    },
  });

  await prisma.virtualAccount.create({
    data: {
      userId: user.id,
      balance: 1000,
      maxRiskPerTrade: 50,
      riskPercent: 5,
    },
  });
  await prisma.platformWallet.create({
    data: { userId: user.id },
  });
  await prisma.investorSettings.create({
    data: {
      userId: user.id,
      dailyYieldPercent: DAILY_YIELD_PERCENT,
      yieldPaused: false,
      paused: false,
      minBalanceExempt: true,
    },
  });
  await prisma.kycVerification.create({
    data: { userId: user.id, status: 'NOT_STARTED' },
  });

  const loginUrl = `${frontendUrl}/login`;
  const forgotUrl = `${frontendUrl}/forgot-password`;
  const investUrl = `${frontendUrl}/invest`;

  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">Your Trade Guard account</h1>
    <p>Hi ${escapeHtml(DISPLAY_NAME)},</p>
    <p>Your Trade Guard account is ready. Sign in here:</p>
    <p><strong>Email:</strong> ${escapeHtml(EMAIL)}<br>
    <strong>Temporary password:</strong> ${escapeHtml(password)}</p>
    <p>Please change this password as soon as you can. Use <strong>Forgot password</strong> on the sign-in page — we will email you a reset link.</p>
    <p>Smart Invest is enabled at <strong>${DAILY_YIELD_PERCENT}% daily yield</strong>. Yield credits on weekdays after you have funds in Smart Invest.</p>
    <p><a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>
    <p><a href="${forgotUrl}" style="color:#93c5fd;">Forgot password / reset</a> · <a href="${investUrl}" style="color:#93c5fd;">Smart Invest</a></p>
  </div></body></html>`;

  const text = `Hi ${DISPLAY_NAME},

Your Trade Guard account is ready.

Email: ${EMAIL}
Temporary password: ${password}

Sign in: ${loginUrl}

Please change this password using Forgot password: ${forgotUrl}

Smart Invest is enabled at ${DAILY_YIELD_PERCENT}% daily yield. Yield credits on weekdays after you have funds in Smart Invest.`;

  await sendEmail(
    EMAIL,
    'Your Trade Guard account — email, password, and Smart Invest 8%',
    html,
    text,
  );

  await sendEmail(
    adminEmail,
    `[Trade Guard] Account created — ${DISPLAY_NAME} (${EMAIL}) 8% Smart Invest`,
    `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
<h1 style="color:#fff;font-size:20px">Account created</h1>
<p><strong>${escapeHtml(DISPLAY_NAME)}</strong> (${escapeHtml(EMAIL)})</p>
<p>User id: ${escapeHtml(user.id)}</p>
<p>Smart Invest: ${DAILY_YIELD_PERCENT}% daily yield (min-balance exempt). Temporary login emailed to the user with a forgot-password reminder.</p>
</div></body></html>`,
    `${DISPLAY_NAME} ${EMAIL} created. 8% Smart Invest. Login emailed to the user.`,
  );

  writeFileSync(
    SENT_PATH,
    JSON.stringify(
      {
        sentAt: new Date().toISOString(),
        userId: user.id,
        email: EMAIL,
        displayName: DISPLAY_NAME,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: user.id,
        email: EMAIL,
        displayName: DISPLAY_NAME,
        password,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
        loginUrl,
        forgotUrl,
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
