/**
 * Enable Smart Invest daily yield for Ely2020 (nelysa2020@gmail.com):
 * - Set minBalanceExempt=true (bypass $750 min balance rule)
 * - No back-pay for missed days
 * - Email user that weekday earnings start today (Sep 4 2026 EAT credit window)
 * - Email admin confirmation
 *
 * Idempotent: audit log source `enable-nelysa2020-yield` tracks completed run + emails.
 *
 * Usage: cd backend && npx tsx scripts/enable-nelysa2020-yield.ts
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

const USER_ID = 'cmsqkmvv51fhtm2017m30on2u';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'nelysa2020@gmail.com';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const SOURCE = 'enable-nelysa2020-yield';
const REFERENCE_PREFIX = 'nelysa2020_enable_yield_2026-09-04';
const DAILY_YIELD_PERCENT = 6;
const KAMPALA_TZ = 'Africa/Kampala';

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

function formatKampalaDate(date: Date) {
  return date.toLocaleDateString('en-GB', {
    timeZone: KAMPALA_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
      if (res.ok) return true;
      lastErr = await res.text();
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 400));
  }
  throw new Error(lastErr);
}

type EmailMeta = {
  user?: { sent: boolean; subject: string; to: string };
  admin?: { sent: boolean; subject: string; to: string };
};

async function main() {
  const now = new Date();
  const creditDate = kampalaCalendarDate(now);
  const creditDateLabel = formatKampalaDate(creditDate);

  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }
  if (!user.investorActive) {
    throw new Error('User is not enrolled in Smart Invest');
  }

  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
    select: { investorYieldPaused: true, investorMinBalanceEnforced: true },
  });
  const globalYieldPaused = config?.investorYieldPaused === true;

  const before = {
    minBalanceExempt: user.investorSettings?.minBalanceExempt ?? false,
    yieldPaused: user.investorSettings?.yieldPaused ?? false,
    globalYieldPaused,
    investorBalance: Number(user.platformWallet?.investorBalance ?? 0),
    walletBalance: Number(user.platformWallet?.availableBalance ?? 0),
    dailyYieldPercent:
      user.investorSettings?.dailyYieldPercent != null
        ? Number(user.investorSettings.dailyYieldPercent)
        : null,
  };

  const existingLog = await prisma.auditLog.findFirst({
    where: {
      targetId: USER_ID,
      metadata: { path: ['source'], equals: SOURCE },
    },
    orderBy: { createdAt: 'desc' },
  });
  const priorEmails = (existingLog?.metadata as { emailsSent?: EmailMeta } | null)
    ?.emailsSent;

  let restrictionsUpdated = false;
  if (!before.minBalanceExempt) {
    await prisma.investorSettings.upsert({
      where: { userId: USER_ID },
      create: {
        userId: USER_ID,
        minBalanceExempt: true,
      },
      update: {
        minBalanceExempt: true,
      },
    });
    restrictionsUpdated = true;
  }

  const afterUser = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true, investorSettings: true },
  });
  const investorBalance = Number(afterUser?.platformWallet?.investorBalance ?? 0);
  const walletBalance = Number(afterUser?.platformWallet?.availableBalance ?? 0);
  const dailyYieldPercent = Number(
    afterUser?.investorSettings?.dailyYieldPercent ?? DAILY_YIELD_PERCENT,
  );
  const minBalanceExempt =
    afterUser?.investorSettings?.minBalanceExempt ?? false;
  const yieldPaused = afterUser?.investorSettings?.yieldPaused ?? false;
  const expectedDailyYield =
    Math.round(((investorBalance * dailyYieldPercent) / 100) * 100) / 100;
  const name = user.displayName?.trim() || 'Ely2020';

  const blocks: string[] = [];
  if (yieldPaused) blocks.push('user yieldPaused=true');
  if (globalYieldPaused) blocks.push('platform investorYieldPaused=true');

  const userSubject = `Smart Invest — daily earnings start ${creditDateLabel}`;
  const userHtml = layout(
    'Smart Invest earnings starting',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>Good news — your <strong>Smart Invest</strong> account is now eligible for weekday daily yield credits.</p>
    <p>Your first credit on <strong>${escapeHtml(creditDateLabel)}</strong> will be processed automatically during the platform's weekday window (<strong>13:00–18:59 EAT</strong>, Africa/Kampala).</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>Smart Invest balance: <strong>$${investorBalance.toFixed(2)} USDT</strong></li>
      <li>Daily yield rate: <strong>${dailyYieldPercent}%</strong></li>
      <li>Expected daily credit: ~<strong>$${expectedDailyYield.toFixed(2)} USDT</strong></li>
      <li>Platform wallet: <strong>$${walletBalance.toFixed(2)} USDT</strong></li>
    </ul>
    <p style="color:#94a3b8;font-size:14px;">Weekday credits run automatically. Weekend yield credits are not issued.</p>
    ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
  );
  const userText = `Hi ${name}, Smart Invest daily earnings start ${creditDateLabel}. Balance: $${investorBalance.toFixed(2)} USDT at ${dailyYieldPercent}% (~$${expectedDailyYield.toFixed(2)} USDT per weekday). First credit today between 13:00–18:59 EAT. ${frontendUrl}/invest`;

  const adminSubject = `[Admin] Ely2020 yield enabled — $${investorBalance.toFixed(2)} @ ${dailyYieldPercent}%, earnings from ${creditDateLabel}`;
  const adminHtml = layout(
    'Ely2020 Smart Invest restrictions removed',
    `<p>Admin operation completed for <strong>${escapeHtml(EMAIL)}</strong>.</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>User: ${escapeHtml(name)} (${escapeHtml(EMAIL)})</li>
      <li>minBalanceExempt: <strong>${minBalanceExempt ? 'enabled' : 'NOT SET — check manually'}</strong></li>
      <li>Back-pay: <strong>none</strong> (per admin request)</li>
      <li>Smart Invest balance: <strong>$${investorBalance.toFixed(2)} USDT</strong></li>
      <li>Daily yield rate: <strong>${dailyYieldPercent}%</strong></li>
      <li>Expected daily credit: ~$${expectedDailyYield.toFixed(2)} USDT</li>
      <li>First credit window: <strong>${escapeHtml(creditDateLabel)}, 13:00–18:59 EAT</strong></li>
      <li>User notified: ${priorEmails?.user?.sent ? 'previously sent' : 'sent this run'}</li>
    </ul>
    ${blocks.length ? `<p style="color:#fbbf24;">Remaining blocks: ${escapeHtml(blocks.join('; '))}</p>` : ''}
    <p style="color:#94a3b8;font-size:13px;">Script: <code>${SOURCE}</code> · Ref: ${REFERENCE_PREFIX}</p>`,
  );
  const adminText = `Ely2020 (${EMAIL}): minBalanceExempt=${minBalanceExempt}, no back-pay, $${investorBalance.toFixed(2)} @ ${dailyYieldPercent}%. First credit ${creditDateLabel} 13:00–18:59 EAT.`;

  let userEmailSent = priorEmails?.user?.sent ?? false;
  let adminEmailSent = priorEmails?.admin?.sent ?? false;
  let userEmailSkipped = userEmailSent;
  let adminEmailSkipped = adminEmailSent;

  if (!userEmailSent) {
    userEmailSent = await sendEmail(EMAIL, userSubject, userHtml, userText);
    userEmailSkipped = false;
  }

  if (!adminEmailSent) {
    adminEmailSent = await sendEmail(
      ADMIN_EMAIL,
      adminSubject,
      adminHtml,
      adminText,
    );
    adminEmailSkipped = false;
  }

  const emailsSent: EmailMeta = {
    user: { sent: userEmailSent, subject: userSubject, to: EMAIL },
    admin: { sent: adminEmailSent, subject: adminSubject, to: ADMIN_EMAIL },
  };

  if (!existingLog) {
    await prisma.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_SETTINGS',
        targetId: USER_ID,
        metadata: {
          source: SOURCE,
          referenceId: REFERENCE_PREFIX,
          minBalanceExempt: true,
          backPayApplied: false,
          restrictionsUpdated,
          before,
          after: {
            minBalanceExempt,
            yieldPaused,
            globalYieldPaused,
            investorBalance,
            walletBalance,
            dailyYieldPercent,
          },
          firstCreditDate: creditDate.toISOString().slice(0, 10),
          firstCreditWindow: '13:00–18:59 EAT',
          emailsSent,
        },
      },
    });
  } else if (!priorEmails?.user?.sent || !priorEmails?.admin?.sent) {
    await prisma.auditLog.update({
      where: { id: existingLog.id },
      metadata: {
        ...(existingLog.metadata as object),
        emailsSent,
        restrictionsUpdated:
          restrictionsUpdated ||
          (existingLog.metadata as { restrictionsUpdated?: boolean })
            ?.restrictionsUpdated,
        after: {
          minBalanceExempt,
          yieldPaused,
          globalYieldPaused,
          investorBalance,
          walletBalance,
          dailyYieldPercent,
        },
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        user: {
          id: USER_ID,
          email: EMAIL,
          displayName: name,
        },
        restrictions: {
          before: before.minBalanceExempt,
          after: minBalanceExempt,
          updated: restrictionsUpdated,
          yieldPaused,
          globalYieldPaused,
          blocks,
        },
        balances: {
          investorBalance,
          walletBalance,
          dailyYieldPercent,
          expectedDailyYield,
        },
        backPayApplied: false,
        firstCredit: {
          date: creditDate.toISOString().slice(0, 10),
          dateLabel: creditDateLabel,
          window: '13:00–18:59 EAT',
        },
        emails: {
          user: {
            to: EMAIL,
            subject: userSubject,
            sent: userEmailSent,
            skippedDuplicate: userEmailSkipped,
          },
          admin: {
            to: ADMIN_EMAIL,
            subject: adminSubject,
            sent: adminEmailSent,
            skippedDuplicate: adminEmailSkipped,
          },
        },
        idempotent: {
          auditLogExists: !!existingLog,
          auditLogId: existingLog?.id ?? null,
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
