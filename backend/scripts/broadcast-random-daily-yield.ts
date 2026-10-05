/**
 * Notify all registered users about random daily Smart Invest yield timing
 * and upcoming instant-withdraw maintenance (Sunday batch remains charge-free).
 *
 * Usage:
 *   cd backend && npx tsx scripts/broadcast-random-daily-yield.ts
 *   cd backend && COUNT_ONLY=1 npx tsx scripts/broadcast-random-daily-yield.ts
 *   cd backend && FORCE=1 npx tsx scripts/broadcast-random-daily-yield.ts
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
const markerPath = resolve(
  __dirname,
  '.sent-random-daily-yield-announcement.json',
);

const SUBJECT =
  'Trade Guard update: Smart Invest daily yield & withdrawal improvements';

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
  const html = layout(
    'Smart Invest update',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>We have a few improvements on Trade Guard that affect Smart Invest and withdrawals.</p>
    <p><strong>Random daily yield timing</strong></p>
    <p>Smart Invest daily earnings now credit on <strong>weekdays</strong> at a <strong>random time between 13:00 and 18:59 Kampala time (EAT)</strong> — no longer a fixed afternoon slot. When you receive your daily credit, you may also get a daily summary email at <strong>21:00 EAT</strong>.</p>
    <p style="background:#334155;border-left:4px solid #f59e0b;padding:12px 14px;border-radius:8px;color:#fde68a;font-size:14px;line-height:1.6;margin:20px 0;">
      <strong>Maintenance notice:</strong> The platform is under <strong>minimal maintenance</strong> as we work to make <strong>instant withdrawals available any day</strong> for all Smart Invest and invested users. Thank you for your patience while we roll this out.
    </p>
    <p><strong>Sunday withdrawals — still charge-free</strong></p>
    <p>If you prefer to wait, <strong>Sunday batch withdrawals remain available with no Sunday charge</strong>. You can request a withdrawal anytime from your wallet and choose the option that suits you.</p>
    <p>
      <a href="${frontendUrl}/invest" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px">Open Smart Invest</a>
      <a href="${frontendUrl}/wallet" style="display:inline-block;background:#334155;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open wallet</a>
    </p>
    <p style="color:#64748b;font-size:13px;margin-top:20px;">Thank you for being part of Trade Guard.</p>`,
  );
  const text = [
    `Hi ${name},`,
    '',
    'Smart Invest daily earnings now credit on weekdays at a random time between 13:00 and 18:59 Kampala time (EAT). You may receive a daily summary email at 21:00 EAT.',
    '',
    'Maintenance notice: We are under minimal maintenance to enable instant withdrawals available any day for all Smart Invest and invested users.',
    '',
    'Sunday batch withdrawals remain available with no Sunday charge if you prefer to wait until then.',
    '',
    `Smart Invest: ${frontendUrl}/invest`,
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
