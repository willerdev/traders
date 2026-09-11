/**
 * Notify all registered users about the new daily auto-withdraw feature.
 * Creates in-app notifications and sends email (slower rate to protect deliverability).
 *
 * Usage:
 *   cd backend && npx tsx scripts/broadcast-auto-withdraw-feature.ts
 *   cd backend && COUNT_ONLY=1 npx tsx scripts/broadcast-auto-withdraw-feature.ts
 *   cd backend && NOTIFICATIONS_ONLY=1 npx tsx scripts/broadcast-auto-withdraw-feature.ts
 *   cd backend && EMAIL_ONLY=1 FORCE=1 npx tsx scripts/broadcast-auto-withdraw-feature.ts
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
  'Tradeguard <info@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';
const force = process.env.FORCE === '1';
const countOnly = process.env.COUNT_ONLY === '1';
const notificationsOnly = process.env.NOTIFICATIONS_ONLY === '1';
const emailOnly = process.env.EMAIL_ONLY === '1';
const sendDelayMs = Math.max(
  400,
  Number(process.env.SEND_DELAY_MS || '650') || 650,
);
const adminEmail = 'willeratmit12@gmail.com';
const markerPath = resolve(__dirname, '.sent-auto-withdraw-feature-announcement.json');

const SUBJECT = 'New on Trade Guard: daily auto-withdraw from your wallet';
const NOTIFICATION_TYPE = 'AUTO_WITHDRAW_FEATURE';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, body: string) {
  return `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;background:#0b0f14;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e8eaed;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f14;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111827;border:1px solid #1e2936;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px 8px;border-bottom:1px solid #1e2936;">
          <p style="margin:0;font-size:13px;color:#5b9cf5;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">Trade Guard</p>
          <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.6;color:#cbd5e1;">${body}</td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #1e2936;font-size:12px;color:#64748b;">
          <a href="${frontendUrl}" style="color:#5b9cf5;text-decoration:none;">thetradeguard.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function isExcludedEmail(email: string) {
  const lower = email.trim().toLowerCase();
  if (!lower.includes('@')) return true;
  const domain = lower.split('@')[1] ?? '';
  return (
    domain === 'example.com' ||
    domain.endsWith('.example.com') ||
    domain === 'example.org' ||
    domain.endsWith('.test') ||
    domain === 'traderrank.internal'
  );
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
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
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (res.ok) return { ok: true, id: body.id };
      lastErr = body.message || JSON.stringify(body);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 500));
  }
  return { ok: false, error: lastErr };
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
      <li>Open <strong>Money → Auto-withdraw</strong> in the sidebar (or tap Notifications in the app)</li>
      <li>Add and verify a TRC20 withdrawal wallet by email</li>
      <li>Pick your amount and turn auto-withdraw on</li>
    </ol>
    <p style="background:#334155;border-left:4px solid #3b82f6;padding:12px 14px;border-radius:8px;color:#bfdbfe;font-size:14px;line-height:1.6;margin:20px 0;">
      <strong>Eligibility:</strong> Auto-withdraw is available to <strong>new wallet depositors</strong> (accounts that make their first confirmed platform wallet deposit after this feature launched). If you deposited before rollout, you can still use manual withdrawals anytime from your wallet.
    </p>
    <p style="margin:24px 0 0;">
      <a href="${autoWithdrawUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;margin-right:8px;">Open auto-withdraw</a>
      <a href="${frontendUrl}/wallet" style="display:inline-block;background:#334155;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Open wallet</a>
    </p>
    <p style="color:#64748b;font-size:13px;margin-top:20px;">Questions? Use in-app Support or reply to this email.</p>`,
  );
  const text = [
    `Hi ${name},`,
    '',
    'Trade Guard now offers daily auto-withdraw from your platform wallet.',
    '',
    'Open Money → Auto-withdraw in the sidebar to set it up.',
    'Runs daily at 09:00 Kampala time to a saved TRC20 address.',
    '',
    'Eligibility: new wallet depositors. Existing depositors can still withdraw manually.',
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
        title: 'New: daily auto-withdraw',
        body: 'Schedule automatic TRC20 sends from your wallet every day at 09:00 Kampala time. Open Money → Auto-withdraw to set it up.',
        linkUrl: '/wallet/auto-withdraw',
      },
    });
    created++;
  }
  return { created, skipped };
}

async function sendOpsSummary(params: {
  notificationsCreated: number;
  notificationsSkipped: number;
  sent: number;
  failed: number;
  eligible: number;
}) {
  const html = layout(
    'Auto-withdraw broadcast summary',
    `<p>Auto-withdraw announcement completed.</p>
    <ul style="line-height:1.7;padding-left:20px">
      <li>In-app notifications created: <strong>${params.notificationsCreated}</strong> (skipped ${params.notificationsSkipped} already notified)</li>
      <li>Emails sent: <strong>${params.sent}</strong> / ${params.eligible}</li>
      <li>Email failures: <strong>${params.failed}</strong></li>
      <li>Send delay: ${sendDelayMs}ms between emails</li>
    </ul>
    <p style="color:#64748b;font-size:13px;">Leaderboard rank emails were disabled to protect deliverability after the first broadcast spike.</p>`,
  );
  await sendEmail(
    adminEmail,
    `[Trade Guard ops] Auto-withdraw broadcast — ${params.sent}/${params.eligible} emails`,
    html,
    `Auto-withdraw broadcast: ${params.sent}/${params.eligible} emails, ${params.notificationsCreated} in-app notifications.`,
  );
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
          sendDelayMs,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (existsSync(markerPath) && !force && !notificationsOnly) {
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
          hint: 'Set FORCE=1 to send emails again, or NOTIFICATIONS_ONLY=1 for in-app only',
        },
        null,
        2,
      ),
    );
    return;
  }

  const userIds = users.map((u) => u.id);
  let notificationsCreated = 0;
  let notificationsSkipped = 0;

  if (!emailOnly) {
    const notif = await createInAppNotifications(userIds);
    notificationsCreated = notif.created;
    notificationsSkipped = notif.skipped;
    console.log(
      `in-app notifications: created=${notificationsCreated} skipped=${notificationsSkipped}`,
    );
  }

  if (notificationsOnly) {
    console.log(
      JSON.stringify(
        {
          notificationsOnly: true,
          notificationsCreated,
          notificationsSkipped,
          eligible: users.length,
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
    const result = await sendEmail(email, subject, html, text);
    if (result.ok) {
      sent++;
      console.log(`sent ${email}${result.id ? ` (${result.id})` : ''}`);
    } else {
      failed++;
      failedEmails.push(email);
      console.error(`failed ${email}`, result.error);
    }
    await new Promise((r) => setTimeout(r, sendDelayMs));
  }

  const sentAt = new Date();
  const marker = {
    sentAt: sentAt.toISOString(),
    subject: SUBJECT,
    rawWithEmail: rawTotal,
    eligible: users.length,
    sent,
    failed,
    sendDelayMs,
    notificationsCreated,
    notificationsSkipped,
    excludedCount: excluded.length,
    excludedSample: excluded.slice(0, 20),
    failedEmails: failedEmails.slice(0, 20),
  };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2));

  await sendOpsSummary({
    notificationsCreated,
    notificationsSkipped,
    sent,
    failed,
    eligible: users.length,
  });

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
