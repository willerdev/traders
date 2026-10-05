/**
 * One-off scheduled yield credit for tuyizeremma1@gmail.com (Emma).
 * Run at or after the delivery time set by enroll-tuyizeremma-smart-invest-12pct.ts.
 *
 * Idempotent: skips if investorDailyCredit already exists for the credit date.
 *
 * Usage:
 *   cd backend && npx tsx scripts/credit-tuyizeremma-scheduled-yield.ts
 *   FORCE=1 npx tsx scripts/credit-tuyizeremma-scheduled-yield.ts   # ignore schedule gate
 *
 * Schedule ~3h after enrollment (macOS):
 *   echo "cd $(pwd) && npx tsx scripts/credit-tuyizeremma-scheduled-yield.ts" | at now + 3 hours
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { kampalaCalendarDate } from '../src/common/kampala-time.util';

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

const USER_ID = 'cmtizuudx0001i66bzbup1kmm';
const EMAIL = 'tuyizeremma1@gmail.com';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const ENROLL_SOURCE = 'enroll-tuyizeremma-smart-invest-12pct';
const CREDIT_REF_PREFIX = 'tuyizeremma_scheduled_yield_2026-09-03';
const force = process.env.FORCE === '1' || process.env.FORCE === 'true';

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
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

function formatKampalaDateTime(date: Date) {
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
  const now = new Date();
  const creditDate = kampalaCalendarDate(now);
  const creditDateKey = creditDate.toISOString().slice(0, 10);
  const creditRef = `${CREDIT_REF_PREFIX}_${creditDateKey}`;

  const existingCredit = await prisma.investorDailyCredit.findUnique({
    where: {
      userId_creditDate: { userId: USER_ID, creditDate },
    },
  });
  if (existingCredit) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'already_credited',
          creditDate: creditDateKey,
          amount: Number(existingCredit.amount),
        },
        null,
        2,
      ),
    );
    return;
  }

  const enrollLog = await prisma.auditLog.findFirst({
    where: {
      targetId: USER_ID,
      action: { in: ['INVESTOR_ENROLL', 'INVESTOR_TRANSFER'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  const meta = enrollLog?.metadata as Record<string, unknown> | null;
  const yieldSchedule = meta?.yieldSchedule as
    | { deliveryAtUtc?: string; deliveryAtKampala?: string }
    | undefined;
  const scheduledAt = yieldSchedule?.deliveryAtUtc
    ? new Date(yieldSchedule.deliveryAtUtc)
    : null;

  if (!force && scheduledAt && now < scheduledAt) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'not_due_yet',
          now: now.toISOString(),
          scheduledAt: scheduledAt.toISOString(),
          scheduledAtKampala: yieldSchedule?.deliveryAtKampala,
          hint: 'Re-run at scheduled time or use FORCE=1',
        },
        null,
        2,
      ),
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }
  if (!user.investorActive) {
    throw new Error('User not enrolled in Smart Invest — run enrollment script first');
  }

  const yieldPercent = Number(
    user.investorSettings?.dailyYieldPercent ?? 12,
  );
  const baseBalance = Number(user.platformWallet?.investorBalance ?? 0);
  if (baseBalance <= 0) {
    throw new Error('No Smart Invest balance to credit yield on');
  }

  const earningAmount =
    Math.round(((baseBalance * yieldPercent) / 100) * 100) / 100;
  if (earningAmount <= 0) {
    throw new Error('Computed yield amount is zero');
  }

  const availableBefore = Number(user.platformWallet?.availableBalance ?? 0);
  const newWalletBalance =
    Math.round((availableBefore + earningAmount) * 100) / 100;
  const name = user.displayName?.trim() || 'Emma';

  await prisma.$transaction([
    prisma.investorDailyCredit.create({
      data: {
        userId: USER_ID,
        amount: earningAmount,
        yieldPercent,
        baseBalance,
        creditDate,
      },
    }),
    prisma.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: newWalletBalance },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: earningAmount,
        type: 'INVESTOR_EARNING',
        referenceId: creditRef,
        description: `Scheduled Smart Invest daily earning ${yieldPercent}% on $${baseBalance.toFixed(2)} — $${earningAmount.toFixed(2)} USDT`,
        balanceAfter: newWalletBalance,
      },
    }),
    prisma.auditLog.create({
      data: {
        adminId: 'cmqmtehqi0000wfaxxntkiua9',
        action: 'INVESTOR_YIELD_CREDIT',
        targetId: USER_ID,
        metadata: {
          source: 'credit-tuyizeremma-scheduled-yield',
          enrollSource: ENROLL_SOURCE,
          creditDate: creditDateKey,
          amount: earningAmount,
          yieldPercent,
          baseBalance,
          scheduledAt: scheduledAt?.toISOString() ?? null,
          creditedAt: now.toISOString(),
        },
      },
    }),
  ]);

  const userSubject = `Smart Invest daily yield — $${earningAmount.toFixed(2)} USDT credited`;
  const userHtml = layout(
    'Daily yield credited',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>Your scheduled Smart Invest daily yield has been credited.</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>Yield rate: <strong>${yieldPercent}%</strong></li>
      <li>Invested balance: <strong>$${baseBalance.toFixed(2)} USDT</strong></li>
      <li>Credit amount: <strong>$${earningAmount.toFixed(2)} USDT</strong></li>
      <li>Platform wallet: <strong>$${newWalletBalance.toFixed(2)} USDT</strong></li>
    </ul>
    ${`<p><a href="${frontendUrl}/invest" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Smart Invest</a></p>`}`,
  );
  const userText = `Smart Invest yield credited: $${earningAmount.toFixed(2)} USDT (${yieldPercent}% on $${baseBalance.toFixed(2)}). Wallet: $${newWalletBalance.toFixed(2)} USDT.`;

  const userEmailSent = await sendEmail(EMAIL, userSubject, userHtml, userText);

  const adminSubject = `[Admin] Emma scheduled yield credited — $${earningAmount.toFixed(2)} USDT`;
  const adminHtml = layout(
    'Emma scheduled yield credited',
    `<p>Scheduled yield credit completed for <strong>${escapeHtml(EMAIL)}</strong>.</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>Credit: <strong>$${earningAmount.toFixed(2)} USDT</strong> (${yieldPercent}% on $${baseBalance.toFixed(2)})</li>
      <li>Credit date (Kampala): <strong>${creditDateKey}</strong></li>
      <li>Credited at: <strong>${formatKampalaDateTime(now)} EAT</strong></li>
      <li>Wallet balance: <strong>$${newWalletBalance.toFixed(2)} USDT</strong></li>
    </ul>`,
  );
  const adminText = `Emma yield credited: $${earningAmount.toFixed(2)} USDT at ${formatKampalaDateTime(now)} EAT.`;

  const adminEmailSent = await sendEmail(
    ADMIN_EMAIL,
    adminSubject,
    adminHtml,
    adminText,
  );

  console.log(
    JSON.stringify(
      {
        credited: true,
        creditDate: creditDateKey,
        yieldPercent,
        baseBalance,
        earningAmount,
        walletBalance: newWalletBalance,
        scheduledAt: scheduledAt?.toISOString() ?? null,
        creditedAt: now.toISOString(),
        emailsSent: {
          user: { to: EMAIL, sent: userEmailSent },
          admin: { to: ADMIN_EMAIL, sent: adminEmailSent },
        },
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
