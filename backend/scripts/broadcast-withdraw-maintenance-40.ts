/**
 * Notify all registered users: withdrawals temporarily capped at 40%, fees waived.
 *
 * Usage:
 *   cd backend && npx tsx scripts/broadcast-withdraw-maintenance-40.ts
 *   cd backend && COUNT_ONLY=1 npx tsx scripts/broadcast-withdraw-maintenance-40.ts
 *   cd backend && FORCE=1 npx tsx scripts/broadcast-withdraw-maintenance-40.ts
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
const adminEmail = 'willeratmit12@gmail.com';
const markerPath = resolve(
  __dirname,
  '.sent-withdraw-maintenance-40.json',
);

const SUBJECT =
  'Trade Guard: temporary 40% withdrawal limit — fees waived during maintenance';

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
    'Temporary withdrawal limit during maintenance',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>Trade Guard is undergoing <strong>system maintenance</strong>. To keep withdrawals running while we complete the fix, we are applying a temporary limit.</p>
    <p style="background:#334155;border-left:4px solid #f59e0b;padding:12px 14px;border-radius:8px;color:#fde68a;font-size:14px;line-height:1.6;margin:20px 0;">
      <strong>What this means:</strong> You can withdraw up to <strong>40% of your available wallet funds</strong> for now. This is temporary and is being fixed.
    </p>
    <p>To keep the system up and running during this window, we are also <strong>removing withdrawal fees temporarily</strong> — no processing fee and no schedule penalty while this maintenance is in effect.</p>
    <p>Your remaining balance stays in your wallet and is not lost. Full withdrawal access will return once maintenance is complete.</p>
    <p>
      <a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open wallet</a>
    </p>
    <p style="color:#64748b;font-size:13px;margin-top:20px;">Thank you for your patience while we resolve this.</p>`,
  );
  const text = [
    `Hi ${name},`,
    '',
    'Trade Guard is undergoing system maintenance. To keep withdrawals running while we complete the fix, withdrawals are temporarily limited to 40% of your available wallet funds.',
    '',
    'This is temporary and is being fixed. Withdrawal fees are also waived during this period (no processing fee and no schedule penalty).',
    '',
    'Your remaining balance stays in your wallet. Full withdrawal access will return once maintenance is complete.',
    '',
    `Wallet: ${frontendUrl}/wallet`,
  ].join('\n');
  return { subject: SUBJECT, html, text };
}

function buildAdminSummary(params: {
  sent: number;
  failed: number;
  eligible: number;
  failedEmails: string[];
}) {
  const html = layout(
    'Broadcast sent — 40% withdrawal maintenance',
    `<p>40% withdrawal-cap broadcast completed.</p>
    <ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
      <li><strong>Subject:</strong> ${escapeHtml(SUBJECT)}</li>
      <li><strong>Eligible recipients:</strong> ${params.eligible}</li>
      <li><strong>Sent:</strong> ${params.sent}</li>
      <li><strong>Failed:</strong> ${params.failed}</li>
    </ul>
    ${
      params.failedEmails.length
        ? `<p style="color:#fca5a5;font-size:13px;">Failed addresses (sample): ${escapeHtml(params.failedEmails.slice(0, 10).join(', '))}</p>`
        : ''
    }`,
  );
  const text = [
    '40% withdrawal-cap broadcast completed.',
    `Subject: ${SUBJECT}`,
    `Eligible: ${params.eligible}`,
    `Sent: ${params.sent}`,
    `Failed: ${params.failed}`,
    params.failedEmails.length
      ? `Failed sample: ${params.failedEmails.slice(0, 10).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    subject: `[Trade Guard ops] 40% withdraw maintenance broadcast — ${params.sent}/${params.eligible} sent`,
    html,
    text,
  };
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
        { skipped: true, ...marker, hint: 'Set FORCE=1 to send again' },
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

  try {
    const adminCopy = buildAdminSummary({
      sent,
      failed,
      eligible: users.length,
      failedEmails,
    });
    await sendEmail(
      adminEmail,
      adminCopy.subject,
      adminCopy.html,
      adminCopy.text,
    );
    console.log(`admin summary sent to ${adminEmail}`);
  } catch (err) {
    console.error(
      `admin summary failed`,
      err instanceof Error ? err.message : err,
    );
  }

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
