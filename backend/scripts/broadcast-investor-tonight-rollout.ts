/**
 * Email Smart Invest users that platform updates go live in 3 hours.
 *
 * Usage:
 *   cd backend && npx tsx scripts/broadcast-investor-tonight-rollout.ts
 *   cd backend && COUNT_ONLY=1 npx tsx scripts/broadcast-investor-tonight-rollout.ts
 *   cd backend && FORCE=1 npx tsx scripts/broadcast-investor-tonight-rollout.ts
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
  '.sent-investor-tonight-rollout.json',
);

const goLiveAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
const goLiveLabel = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Africa/Nairobi',
  timeZoneName: 'short',
}).format(goLiveAt);

const SUBJECT = `Trade Guard updates go live tonight (${goLiveLabel})`;

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
    'Updates go live tonight',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>Thank you for your patience while TradeGuard has been under maintenance. <strong>Platform updates will be rolled in tonight at ${escapeHtml(goLiveLabel)}</strong> — exactly three hours from this notice.</p>
    <p style="background:#334155;border-left:4px solid #38bdf8;padding:12px 14px;border-radius:8px;color:#e0f2fe;font-size:14px;line-height:1.6;margin:20px 0;">
      When you next open your dashboard, please read the in-app notice and press <strong>I agree</strong>. That notice explains the withdrawal reserve policy and the move to daily withdrawals.
    </p>
    <p><strong>What is changing</strong></p>
    <ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
      <li>Withdrawals will initially pay <strong>40%</strong> of the requested amount. The remaining <strong>60%</strong> stays in platform reserves to keep the system stable during high demand and unexpected issues.</li>
      <li>We are moving to a <strong>daily withdrawal</strong> process instead of the previous schedule, after testing and security checks complete.</li>
    </ul>
    <p>No action is required before tonight other than reading and agreeing to the dashboard notice when it appears.</p>
    <p>
      <a href="${frontendUrl}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open dashboard</a>
    </p>
    <p style="color:#64748b;font-size:13px;margin-top:20px;">Kind regards,<br/>TradeGuard Team</p>`,
  );
  const text = [
    `Hi ${name},`,
    '',
    `TradeGuard updates will be rolled in tonight at ${goLiveLabel} — exactly three hours from this notice.`,
    '',
    'When you open your dashboard, read the in-app notice and press I agree.',
    '',
    'Withdrawals will initially pay 40% of the requested amount. The remaining 60% stays in platform reserves.',
    'We are moving to daily withdrawals after testing and security checks complete.',
    '',
    `Dashboard: ${frontendUrl}/dashboard`,
    '',
    'Kind regards,',
    'TradeGuard Team',
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
    'Broadcast sent — tonight rollout notice',
    `<p>Investor rollout-notice broadcast completed.</p>
    <ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
      <li><strong>Subject:</strong> ${escapeHtml(SUBJECT)}</li>
      <li><strong>Go-live:</strong> ${escapeHtml(goLiveLabel)}</li>
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
    'Investor rollout-notice broadcast completed.',
    `Subject: ${SUBJECT}`,
    `Go-live: ${goLiveLabel}`,
    `Eligible: ${params.eligible}`,
    `Sent: ${params.sent}`,
    `Failed: ${params.failed}`,
  ].join('\n');
  return {
    subject: `[Trade Guard ops] Tonight rollout notice — ${params.sent}/${params.eligible} sent`,
    html,
    text,
  };
}

async function collectRecipients() {
  const raw = await prisma.user.findMany({
    where: {
      email: { not: null },
      status: { not: 'BANNED' },
      OR: [
        { investorActive: true },
        { platformWallet: { investorBalance: { gt: 0 } } },
      ],
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
          goLiveAt: goLiveAt.toISOString(),
          goLiveLabel,
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
    goLiveAt: goLiveAt.toISOString(),
    goLiveLabel,
    subject: SUBJECT,
    rawWithEmail: rawTotal,
    eligible: users.length,
    sent,
    failed,
    excludedCount: excluded.length,
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
