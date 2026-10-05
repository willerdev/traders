/**
 * Enable Smart Invest daily yield for Ely2020 (nelysa2020@gmail.com):
 * - Set minBalanceExempt=true (match Veve) so $80 balance is eligible
 * - No back-credit of missed days
 * - Notify user that weekday earnings start tomorrow
 *
 * Idempotent: keyed on audit log metadata reference.
 *
 * Usage: cd backend && npx tsx scripts/enable-nelysa2020-smart-invest-yield.ts
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
const USER_ID = 'cmsqkmvv51fhtm2017m30on2u';
const EMAIL = 'nelysa2020@gmail.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const REFERENCE_ID = 'nelysa2020_min_balance_exempt_2026-09-04';
const DAILY_YIELD_PERCENT = 6;

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

const SUBJECT = 'Smart Invest — your daily earnings start tomorrow';

async function main() {
  const existing = await prisma.auditLog.findFirst({
    where: {
      targetId: USER_ID,
      action: 'INVESTOR_MIN_BALANCE_EXEMPT',
      metadata: { path: ['referenceId'], equals: REFERENCE_ID },
    },
  });

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

  const investorBalance = Number(user.platformWallet?.investorBalance ?? 0);
  const before = {
    minBalanceExempt: user.investorSettings?.minBalanceExempt ?? false,
    yieldPaused: user.investorSettings?.yieldPaused ?? false,
    paused: user.investorSettings?.paused ?? false,
    dailyYieldPercent:
      user.investorSettings?.dailyYieldPercent != null
        ? Number(user.investorSettings.dailyYieldPercent)
        : null,
    investorBalance,
    investorActive: user.investorActive,
  };

  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
    select: { investorYieldPaused: true, investorMinBalanceEnforced: true },
  });

  const blocks = {
    globalYieldPaused: Boolean(config?.investorYieldPaused),
    minBalanceEnforced: config?.investorMinBalanceEnforced !== false,
    minBalanceExempt: before.minBalanceExempt,
    yieldPaused: before.yieldPaused,
    investorPaused: before.paused,
    investorActive: before.investorActive,
    balanceUsdt: investorBalance,
  };

  if (existing) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'already_processed',
          referenceId: REFERENCE_ID,
          email: user.email,
          before,
          after: {
            minBalanceExempt: user.investorSettings?.minBalanceExempt ?? false,
            yieldPaused: user.investorSettings?.yieldPaused ?? false,
            paused: user.investorSettings?.paused ?? false,
          },
          blocks,
          emailSent: false,
          subject: SUBJECT,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (blocks.globalYieldPaused) {
    throw new Error('Global investor yield is paused — resolve before enabling user');
  }
  if (before.yieldPaused) {
    throw new Error('User yieldPaused=true — clear before running');
  }

  const settings = await prisma.investorSettings.upsert({
    where: { userId: USER_ID },
    create: {
      userId: USER_ID,
      riskPercent: 2,
      dailyYieldPercent: DAILY_YIELD_PERCENT,
      committedInvestmentAmount: investorBalance,
      minBalanceExempt: true,
    },
    update: {
      minBalanceExempt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'INVESTOR_MIN_BALANCE_EXEMPT',
      targetId: USER_ID,
      metadata: {
        referenceId: REFERENCE_ID,
        source: 'enable-nelysa2020-smart-invest-yield',
        minBalanceExempt: true,
        backCreditSkipped: true,
        investorBalance,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
      },
    },
  });

  const name = user.displayName?.trim() || 'there';
  const expectedDaily =
    Math.round(((investorBalance * DAILY_YIELD_PERCENT) / 100) * 100) / 100;

  const html = layout(
    'Smart Invest daily earnings',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>Good news — your <strong>Smart Invest</strong> account is set up and your daily earnings will begin <strong>tomorrow</strong>.</p>
    <p>Your invested balance of <strong>$${investorBalance.toFixed(2)} USDT</strong> will earn at a <strong>${DAILY_YIELD_PERCENT}% daily yield</strong> on weekdays (Kampala time). At your current balance, that is approximately <strong>$${expectedDaily.toFixed(2)} USDT</strong> per weekday credit, paid to your platform wallet.</p>
    <p style="color:#94a3b8;font-size:14px;">Yield credits run once each weekday. Weekend days do not receive a daily credit.</p>
    ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}
    <p style="color:#94a3b8;font-size:13px;margin-top:24px;">Questions? Reply to this email or contact Support from your account.</p>`,
  );

  const text = `Hi ${name}, your Smart Invest daily earnings will begin tomorrow. Your $${investorBalance.toFixed(2)} USDT invested balance earns ${DAILY_YIELD_PERCENT}% daily on weekdays (~$${expectedDaily.toFixed(2)} USDT per weekday). Open ${frontendUrl}/invest`;

  const emailSent = await sendEmail(user.email, SUBJECT, html, text);

  const afterUser = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { investorSettings: true, platformWallet: true },
  });

  console.log(
    JSON.stringify(
      {
        user: {
          id: USER_ID,
          email: user.email,
          displayName: user.displayName,
        },
        before,
        after: {
          minBalanceExempt: afterUser?.investorSettings?.minBalanceExempt ?? false,
          yieldPaused: afterUser?.investorSettings?.yieldPaused ?? false,
          paused: afterUser?.investorSettings?.paused ?? false,
          dailyYieldPercent:
            afterUser?.investorSettings?.dailyYieldPercent != null
              ? Number(afterUser.investorSettings.dailyYieldPercent)
              : null,
          investorBalance: Number(afterUser?.platformWallet?.investorBalance ?? 0),
        },
        blocksChecked: blocks,
        fieldsChanged: ['investorSettings.minBalanceExempt → true'],
        backCredit: false,
        emailSent,
        subject: SUBJECT,
        referenceId: REFERENCE_ID,
        settingsId: settings.id,
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
