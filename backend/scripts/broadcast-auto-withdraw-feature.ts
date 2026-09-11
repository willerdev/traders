/**
 * Notify all registered users about the new daily auto-withdraw feature.
 *
 * Usage:
 *   cd backend && npx tsx scripts/broadcast-auto-withdraw-feature.ts
 *   cd backend && COUNT_ONLY=1 npx tsx scripts/broadcast-auto-withdraw-feature.ts
 *   cd backend && FORCE=1 npx tsx scripts/broadcast-auto-withdraw-feature.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, writeFileSync } from 'fs';
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
const force = process.env.FORCE === '1';
const countOnly = process.env.COUNT_ONLY === '1';
const markerPath = resolve(__dirname, '.sent-auto-withdraw-feature-announcement.json');

const SUBJECT = 'New on Trade Guard: daily auto-withdraw from your wallet';

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

function isExcludedEmail(email: string) {
  const lower = email.trim().toLowerCase();
  if (!lower.includes('@')) return true;
  const domain = lower.split('@')[1] ?? '';
  return (
    domain === 'example.com' ||
    domain.endsWith('.example.com') ||
    domain === 'example.org' ||
    domain.endsWith('.test')
  );
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
      lastErr = await res.text();
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 400));
  }
  throw new Error(lastErr);
}

function buildEmail(name: string) {
  const autoWithdrawUrl = `${frontendUrl}/wallet/auto-withdraw`;
  const html = layout(
    'Daily auto-withdraw is here',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>We added a new wallet feature on Trade Guard: <strong>daily auto-withdraw</strong>.</p>
    <p><strong>What it does</strong></p>
    <ul style="line-height:1.7;padding-left:20px">
      <li>Schedule automatic sends from your platform wallet to a saved <strong>TRC20</strong> address</li>
      <li>Runs every day at <strong>09:00 Kampala time (EAT)</strong></li>
      <li>Choose a fixed daily amount or send your full available balance</li>
    </ul>
    <p><strong>How to set it up</strong></p>
    <ol style="line-height:1.7;padding-left:20px">
      <li>Open <strong>Money → Auto-withdraw</strong> in the sidebar</li>
      <li>Add and verify a TRC20 withdrawal wallet by email</li>
      <li>Pick your amount and turn auto-withdraw on</li>
    </ol>
    <p style="background:#334155;border-left:4px solid #3b82f6;padding:12px 14px;border-radius:8px;color:#bfdbfe;font-size:14px;line-height:1.6;margin:20px 0;">
      <strong>Eligibility:</strong> Auto-withdraw is available to <strong>new wallet depositors</strong> (accounts that make their first confirmed platform wallet deposit after this feature launched). If you deposited before rollout, you can still use manual withdrawals anytime from your wallet.
    </p>
    <p>
      <a href="${autoWithdrawUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px">Open auto-withdraw</a>
      <a href="${frontendUrl}/wallet" style="display:inline-block;background:#334155;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open wallet</a>
    </p>
    <p style="color:#64748b;font-size:13px;margin-top:20px;">Questions? Reply to this email or use in-app Support.</p>`,
  );
  const text = [
    `Hi ${name},`,
    '',
    'Trade Guard now offers daily auto-withdraw from your platform wallet.',
    '',
    'What it does:',
    '- Automatic sends to a saved TRC20 address every day at 09:00 Kampala time (EAT)',
    '- Choose a fixed daily amount or your full available balance',
    '',
    'How to set it up:',
    '1. Open Money → Auto-withdraw in the sidebar',
    '2. Add and verify a TRC20 withdrawal wallet',
    '3. Choose amount and enable auto-withdraw',
    '',
    'Eligibility: new wallet depositors (first confirmed deposit after this feature launched). Existing depositors can still withdraw manually from the wallet.',
    '',
    `Auto-withdraw: ${autoWithdrawUrl}`,
    `Wallet: ${frontendUrl}/wallet`,
  ].join('\n');
  return { subject: SUBJECT, html, text };
}

async function collectRecipients() {
  const raw = await prisma.user.findMany({
    where: {
      email: { not: null },
      status: { not: 'BANNED' },
    },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  });

  const excluded: string[] = [];
  const users = raw.filter((user) => {
    const email = user.email?.trim().toLowerCase();
    if (!email) return false;
    if (isExcludedEmail(email)) {
      excluded.push(email);
      return false;
    }
    return true;
  });

  return { users, excluded, rawTotal: raw.length };
}

async function main() {
  const { users, excluded, rawTotal } = await collectRecipients();

  if (countOnly) {
    console.log(
      JSON.stringify(
        {
          countOnly: true,
          rawWithEmail: rawTotal,
          eligible: users.length,
          excludedCount: excluded.length,
          excludedSample: excluded.slice(0, 20),
          subject: SUBJECT,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (existsSync(markerPath) && !force) {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as {
      sentAt: string;
      sent: number;
      failed: number;
      subject: string;
    };
    console.log(
      JSON.stringify(
        {
          skipped: true,
          ...marker,
          hint: 'Set FORCE=1 to send again',
        },
        null,
        2,
      ),
    );
    return;
  }

  let sent = 0;
  let failed = 0;
  const failedEmails: string[] = [];

  for (const user of users) {
    const email = user.email!.trim().toLowerCase();
    const name = user.displayName?.trim() || 'there';
    const { subject, html, text } = buildEmail(name);
    try {
      await sendEmail(email, subject, html, text);
      sent++;
      console.log(`sent ${email}`);
    } catch (err) {
      failed++;
      failedEmails.push(email);
      console.error(`failed ${email}`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  const sentAt = new Date();
  const marker = {
    sentAt: sentAt.toISOString(),
    subject: SUBJECT,
    rawWithEmail: rawTotal,
    eligible: users.length,
    sent,
    failed,
    excludedCount: excluded.length,
    excludedSample: excluded.slice(0, 20),
    failedEmails: failedEmails.slice(0, 20),
  };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2));

  console.log(JSON.stringify({ skipped: false, ...marker }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
