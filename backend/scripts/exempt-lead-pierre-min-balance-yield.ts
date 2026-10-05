/**
 * Exempt Lead + Pierre from the $750 Smart Invest min-balance rule so $480 balances earn.
 *
 * Usage: cd backend && npx tsx scripts/exempt-lead-pierre-min-balance-yield.ts
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
  'Trade Guard <info@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';

const TARGETS = [
  {
    id: 'cmu1m0vqe9jlyj401lmy2m4hk',
    email: 'nshutigayo400@gmail.com',
    label: 'Lead',
  },
  {
    id: 'cms9ho0ag03lbfa0164qglrim',
    email: 'petertuyis05@gmail.com',
    label: 'Pierre',
  },
] as const;

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

async function main() {
  const results: unknown[] = [];

  for (const target of TARGETS) {
    const user = await prisma.user.findUnique({
      where: { id: target.id },
      include: { investorSettings: true, platformWallet: true },
    });
    if (!user?.email) throw new Error(`${target.email} not found`);
    if (user.email.toLowerCase() !== target.email) {
      throw new Error(`Email mismatch for ${target.id}: ${user.email}`);
    }
    if (!user.investorActive) {
      throw new Error(`${target.email} is not enrolled in Smart Invest`);
    }

    const invested = Number(user.platformWallet?.investorBalance ?? 0);
    const settings = await prisma.investorSettings.upsert({
      where: { userId: target.id },
      create: {
        userId: target.id,
        minBalanceExempt: true,
        yieldPaused: false,
      },
      update: {
        minBalanceExempt: true,
        yieldPaused: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_MIN_BALANCE_EXEMPT',
        targetId: target.id,
        metadata: {
          source: 'exempt-lead-pierre-min-balance-yield',
          email: target.email,
          minBalanceExempt: true,
          investorBalance: invested,
        },
      },
    });

    const name = user.displayName?.trim() || target.label;
    const yieldPercent =
      settings.dailyYieldPercent != null
        ? Number(settings.dailyYieldPercent)
        : 8;
    const expectedDaily =
      Math.round(((invested * yieldPercent) / 100) * 100) / 100;

    const userSubject = 'Smart Invest yield enabled on your account';
    const userSent = await sendEmail(
      target.email,
      userSubject,
      layout(
        'Your Smart Invest yield is active',
        `<p>Hi ${escapeHtml(name)},</p>
        <p>Your Smart Invest account is now enabled to earn daily yield on your current balance.</p>
        <ul style="line-height:1.6;padding-left:20px">
          <li>Smart Invest balance: <strong>$${invested.toFixed(2)} USDT</strong></li>
          <li>Daily yield: <strong>${yieldPercent}%</strong> on weekdays (Kampala time)</li>
          <li>Expected daily credit at this balance: about <strong>$${expectedDaily.toFixed(2)} USDT</strong></li>
        </ul>
        <p>Credits land on weekdays between <strong>13:00 and 18:59 Kampala time</strong>, paid to your platform wallet. There is no back-pay for days before this update.</p>
        <p><a href="${frontendUrl}/invest" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Smart Invest</a></p>`,
      ),
      `Hi ${name}, Smart Invest yield is now enabled on your $${invested.toFixed(2)} USDT balance at ${yieldPercent}% weekdays (~$${expectedDaily.toFixed(2)}/day). Credits 13:00–18:59 Kampala. No back-pay.`,
    );

    results.push({
      email: target.email,
      displayName: user.displayName,
      investorBalance: invested,
      minBalanceExempt: settings.minBalanceExempt,
      yieldPaused: settings.yieldPaused,
      dailyYieldPercent: yieldPercent,
      expectedDaily,
      userEmailSent: userSent,
    });
  }

  const adminSent = await sendEmail(
    ADMIN_EMAIL,
    '[Admin] Min-balance yield exempt — Lead & Pierre',
    layout(
      'Min-balance exempt applied',
      `<p>Smart Invest min-balance exemption set for:</p>
      <ul style="line-height:1.6;padding-left:20px">
        ${results
          .map(
            (r) =>
              `<li>${escapeHtml(String((r as { displayName: string }).displayName))} (${escapeHtml(String((r as { email: string }).email))}) — $${Number((r as { investorBalance: number }).investorBalance).toFixed(2)} invested, ${Number((r as { dailyYieldPercent: number }).dailyYieldPercent)}% daily</li>`,
          )
          .join('')}
      </ul>
      <p>No back-pay. Next weekday credit window 13:00–18:59 Kampala.</p>`,
    ),
    'Lead and Pierre minBalanceExempt=true. $480 @ 8%. No back-pay.',
  );

  console.log(JSON.stringify({ results, adminEmailSent: adminSent }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
