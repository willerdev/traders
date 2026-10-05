/**
 * Trade Guard: tell every member that withdrawals are temporarily open
 * on Wednesday and Saturday only (gate: src/wallet/withdraw-maintenance.ts WITHDRAW_DAYS).
 *
 * Usage:
 *   cd backend && COUNT_ONLY=1 npx tsx scripts/broadcast-withdraw-wed-sat.ts
 *   cd backend && npx tsx scripts/broadcast-withdraw-wed-sat.ts
 *   cd backend && FORCE=1 npx tsx scripts/broadcast-withdraw-wed-sat.ts
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
const markerPath = resolve(__dirname, '.sent-withdraw-wed-sat.json');
const NOTIFICATION_TYPE = 'WITHDRAW_DAYS_WED_SAT';

const SUBJECT = 'Withdrawals: temporarily open on Wednesday and Saturday';

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
    'Withdrawals on Wednesday and Saturday',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>As part of making the system run more reliably, we are temporarily changing when withdrawals are processed.</p>
    <p style="background:#334155;border-left:4px solid #f59e0b;padding:12px 14px;border-radius:8px;color:#fde68a;font-size:14px;line-height:1.6;margin:20px 0;">
      Withdrawals are now open on <strong>every third day: Wednesday and Saturday</strong>. Requests on other days will not go through, so please withdraw on one of those days.
    </p>
    <p>This is temporary. We will let you know as soon as withdrawals are open every day again.</p>
    <p>
      <a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Wallet</a>
    </p>`,
  );
  const text = [
    `Hi ${name},`,
    '',
    'As part of making the system run more reliably, we are temporarily changing when withdrawals are processed.',
    '',
    'Withdrawals are now open on every third day: Wednesday and Saturday. Requests on other days will not go through, so please withdraw on one of those days.',
    '',
    'This is temporary. We will let you know as soon as withdrawals are open every day again.',
    '',
    `${frontendUrl}/wallet`,
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

async function createInAppNotifications(userIds: string[]) {
  let created = 0;
  let skipped = 0;
  for (const userId of userIds) {
    const existing = await prisma.platformNotification.findFirst({
      where: { userId, type: NOTIFICATION_TYPE },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.platformNotification.create({
      data: {
        userId,
        type: NOTIFICATION_TYPE,
        title: 'Withdrawals: Wednesday and Saturday',
        body: 'Withdrawals are temporarily open on Wednesday and Saturday only. Requests on other days will not go through.',
        linkUrl: '/wallet',
      },
    });
    created++;
  }
  return { created, skipped };
}

async function main() {
  const { users, excluded, rawTotal } = await collectRecipients();

  if (countOnly) {
    console.log(
      JSON.stringify(
        {
          countOnly: true,
          total: rawTotal,
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
    console.log(
      JSON.stringify(
        {
          skipped: true,
          ...JSON.parse(readFileSync(markerPath, 'utf8')),
          hint: 'Set FORCE=1 to send again',
        },
        null,
        2,
      ),
    );
    return;
  }

  const notifications = await createInAppNotifications(users.map((u) => u.id));

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

  const marker = {
    sentAt: new Date().toISOString(),
    subject: SUBJECT,
    total: rawTotal,
    eligible: users.length,
    sent,
    failed,
    excludedCount: excluded.length,
    failedEmails: failedEmails.slice(0, 20),
    notificationsCreated: notifications.created,
    notificationsSkipped: notifications.skipped,
  };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2));

  try {
    await sendEmail(
      adminEmail,
      `[Trade Guard ops] Wed/Sat withdrawals broadcast — ${sent}/${users.length}`,
      layout(
        'Broadcast sent — Wednesday/Saturday withdrawals',
        `<ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
          <li><strong>Emails sent:</strong> ${sent} / ${users.length}</li>
          <li><strong>Failed:</strong> ${failed}</li>
          <li><strong>In-app notices:</strong> ${notifications.created} (skipped ${notifications.skipped})</li>
        </ul>`,
      ),
      `Wed/Sat withdrawals broadcast. Sent ${sent}/${users.length}. Failed ${failed}.`,
    );
    console.log(`admin summary sent to ${adminEmail}`);
  } catch (err) {
    console.error('admin summary failed', err instanceof Error ? err.message : err);
  }

  console.log(JSON.stringify({ ok: true, ...marker }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
