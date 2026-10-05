/**
 * Pause Trade Guard Smart Invest daily yield until Monday 28 Sep 2026
 * (start of that business day, Africa/Kampala clock used by yield jobs)
 * and notify enrolled Smart Invest members.
 *
 * Usage:
 *   cd backend && npx tsx scripts/broadcast-yield-pause-until-monday.ts
 *   cd backend && COUNT_ONLY=1 npx tsx scripts/broadcast-yield-pause-until-monday.ts
 *   cd backend && FORCE=1 npx tsx scripts/broadcast-yield-pause-until-monday.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  YIELD_PAUSE_RESUME_AT,
  YIELD_PAUSE_RESUME_LABEL,
} from '../src/investor/investor-opt-out.util';

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
const markerPath = resolve(__dirname, '.sent-yield-pause-until-monday-28.json');
const NOTIFICATION_TYPE = 'INVESTOR_YIELD_PAUSE_MON28';

const SUBJECT = `Smart Invest: daily yield continues ${YIELD_PAUSE_RESUME_LABEL}`;

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
    'Daily yield continues Monday',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>Smart Invest <strong>daily yield</strong> is paused for a short period.</p>
    <p style="background:#334155;border-left:4px solid #f59e0b;padding:12px 14px;border-radius:8px;color:#fde68a;font-size:14px;line-height:1.6;margin:20px 0;">
      Daily revenue yield continues <strong>${escapeHtml(YIELD_PAUSE_RESUME_LABEL)}</strong> on the usual weekday schedule.
    </p>
    <p>Your Smart Invest balance remains in place. No action is required.</p>
    <p>
      <a href="${frontendUrl}/invest" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Smart Invest</a>
    </p>`,
  );
  const text = [
    `Hi ${name},`,
    '',
    'Smart Invest daily yield is paused for a short period.',
    '',
    `Daily revenue yield continues ${YIELD_PAUSE_RESUME_LABEL} on the usual weekday schedule.`,
    '',
    'Your Smart Invest balance remains in place. No action is required.',
    '',
    `${frontendUrl}/invest`,
  ].join('\n');
  return { subject: SUBJECT, html, text };
}

async function enableYieldPause() {
  await prisma.platformConfig.update({
    where: { id: 'default' },
    data: {
      investorMaintenanceUntil: YIELD_PAUSE_RESUME_AT,
      // Prevent Friday weekly 20% credits during this short pause.
      investorWeeklyProfitFraction: 0,
      ...(countOnly ? {} : { investorMaintenanceAnnouncedAt: new Date() }),
    },
  });
  return YIELD_PAUSE_RESUME_AT;
}

async function collectRecipients() {
  const raw = await prisma.user.findMany({
    where: {
      investorActive: true,
      status: { not: 'BANNED' },
      email: { not: null },
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
        title: `Daily yield continues ${YIELD_PAUSE_RESUME_LABEL}`,
        body: `Smart Invest daily yield is paused and continues ${YIELD_PAUSE_RESUME_LABEL} on the usual weekday schedule. Your balance remains in place.`,
        linkUrl: '/invest',
      },
    });
    created++;
  }
  return { created, skipped };
}

async function main() {
  const until = await enableYieldPause();
  const { users, excluded, rawTotal } = await collectRecipients();
  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
    select: {
      investorMaintenanceUntil: true,
      investorWeeklyProfitFraction: true,
      investorYieldPaused: true,
    },
  });

  const skipConfirmed =
    Boolean(
      config?.investorMaintenanceUntil &&
        config.investorMaintenanceUntil.getTime() === until.getTime(),
    ) && Number(config?.investorWeeklyProfitFraction ?? 1) === 0;

  if (countOnly) {
    console.log(
      JSON.stringify(
        {
          countOnly: true,
          enrolled: rawTotal,
          eligible: users.length,
          excludedCount: excluded.length,
          maintenanceUntil: config?.investorMaintenanceUntil?.toISOString() ?? null,
          weeklyProfitFraction: Number(config?.investorWeeklyProfitFraction ?? 0),
          investorYieldPaused: Boolean(config?.investorYieldPaused),
          skipConfirmed,
          skipPath:
            'investor.service.creditDailyEarnings → investorMaintenanceUntil',
          banner: ['/invest', '/redeem'],
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
          maintenanceUntil: config?.investorMaintenanceUntil?.toISOString() ?? null,
          skipConfirmed,
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

  const sentAt = new Date();
  const marker = {
    sentAt: sentAt.toISOString(),
    subject: SUBJECT,
    enrolled: rawTotal,
    eligible: users.length,
    sent,
    emailsSent: sent,
    failed,
    excludedCount: excluded.length,
    failedEmails: failedEmails.slice(0, 20),
    notificationsCreated: notifications.created,
    notificationsSkipped: notifications.skipped,
    maintenanceUntil: until.toISOString(),
    weeklyProfitFraction: 0,
    skipConfirmed,
    skipPath: 'investor.service.creditDailyEarnings → investorMaintenanceUntil',
    banner: ['/invest', '/redeem'],
  };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2));

  try {
    const adminHtml = layout(
      'Broadcast sent — Smart Invest yield pause',
      `<p>Daily yield paused until <strong>${escapeHtml(until.toISOString())}</strong> (${escapeHtml(YIELD_PAUSE_RESUME_LABEL)}).</p>
      <ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
        <li><strong>Eligible:</strong> ${users.length}</li>
        <li><strong>Emails sent:</strong> ${sent}</li>
        <li><strong>Failed:</strong> ${failed}</li>
        <li><strong>In-app notices:</strong> ${notifications.created} (skipped ${notifications.skipped})</li>
        <li><strong>Skip confirmed:</strong> ${skipConfirmed ? 'yes' : 'no'}</li>
      </ul>`,
    );
    await sendEmail(
      adminEmail,
      `[Trade Guard ops] yield pause broadcast — ${sent}/${users.length}`,
      adminHtml,
      `Yield pause until ${until.toISOString()}. Sent ${sent}/${users.length}. Failed ${failed}.`,
    );
    console.log(`admin summary sent to ${adminEmail}`);
  } catch (err) {
    console.error(
      `admin summary failed`,
      err instanceof Error ? err.message : err,
    );
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
