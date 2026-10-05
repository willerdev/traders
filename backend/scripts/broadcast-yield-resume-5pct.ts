/**
 * Trade Guard: resume Smart Invest daily yield, set every investor to 5%,
 * and email enrolled Smart Invest members why.
 *
 * Usage:
 *   cd backend && COUNT_ONLY=1 npx tsx scripts/broadcast-yield-resume-5pct.ts
 *   cd backend && npx tsx scripts/broadcast-yield-resume-5pct.ts
 *   cd backend && FORCE=1 npx tsx scripts/broadcast-yield-resume-5pct.ts
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
const markerPath = resolve(__dirname, '.sent-yield-resume-5pct.json');
const NOTIFICATION_TYPE = 'INVESTOR_YIELD_RESUME_5PCT';
const YIELD_PERCENT = 5;

const SUBJECT = 'Smart Invest: daily yield has resumed at 5%';

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
    'Daily yield has resumed',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>Smart Invest <strong>daily yield has resumed</strong>.</p>
    <p style="background:#334155;border-left:4px solid #22c55e;padding:12px 14px;border-radius:8px;color:#bbf7d0;font-size:14px;line-height:1.6;margin:20px 0;">
      From today every Smart Invest member earns <strong>${YIELD_PERCENT}% daily yield</strong>, credited on weekdays (Monday to Friday).
    </p>
    <p>Why ${YIELD_PERCENT}% for everyone:</p>
    <ul style="color:#cbd5e1;font-size:14px;padding-left:20px;line-height:1.7;">
      <li>We are testing how to run the system <strong>reliably</strong> day after day.</li>
      <li>We are trialling <strong>new income models</strong> for the platform.</li>
      <li>Our goal is a <strong>reliable return on investment</strong> you can count on.</li>
    </ul>
    <p>Your Smart Invest balance remains in place. No action is required.</p>
    <p>
      <a href="${frontendUrl}/invest" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Smart Invest</a>
    </p>`,
  );
  const text = [
    `Hi ${name},`,
    '',
    'Smart Invest daily yield has resumed.',
    '',
    `From today every Smart Invest member earns ${YIELD_PERCENT}% daily yield, credited on weekdays (Monday to Friday).`,
    '',
    `Why ${YIELD_PERCENT}% for everyone:`,
    '- We are testing how to run the system reliably day after day.',
    '- We are trialling new income models for the platform.',
    '- Our goal is a reliable return on investment you can count on.',
    '',
    'Your Smart Invest balance remains in place. No action is required.',
    '',
    `${frontendUrl}/invest`,
  ].join('\n');
  return { subject: SUBJECT, html, text };
}

async function applyYieldResume() {
  const investors = await prisma.user.findMany({
    where: { investorActive: true },
    select: { id: true },
  });
  const before = await prisma.investorSettings.groupBy({
    by: ['dailyYieldPercent'],
    _count: { _all: true },
  });
  if (countOnly) {
    return { investors: investors.length, before, applied: false };
  }

  await prisma.platformConfig.update({
    where: { id: 'default' },
    data: {
      investorYieldPaused: false,
      investorMaintenanceUntil: null,
      investorDailyYieldPercent: YIELD_PERCENT,
    },
  });
  const updatedExisting = await prisma.investorSettings.updateMany({
    data: { dailyYieldPercent: YIELD_PERCENT },
  });
  for (const { id } of investors) {
    await prisma.investorSettings.upsert({
      where: { userId: id },
      create: { userId: id, dailyYieldPercent: YIELD_PERCENT },
      update: { dailyYieldPercent: YIELD_PERCENT },
    });
  }
  return {
    investors: investors.length,
    before,
    updatedExisting: updatedExisting.count,
    applied: true,
  };
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
        title: `Daily yield resumed at ${YIELD_PERCENT}%`,
        body: `Smart Invest daily yield has resumed at ${YIELD_PERCENT}% for every member (weekdays). We are testing reliable operation, new income models, and a reliable return on investment.`,
        linkUrl: '/invest',
      },
    });
    created++;
  }
  return { created, skipped };
}

async function main() {
  if (!countOnly && existsSync(markerPath) && !force) {
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

  const resume = await applyYieldResume();
  const { users, excluded, rawTotal } = await collectRecipients();
  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
    select: {
      investorDailyYieldPercent: true,
      investorYieldPaused: true,
      investorMaintenanceUntil: true,
    },
  });
  const pausedUsers = await prisma.investorSettings.findMany({
    where: { yieldPaused: true, user: { investorActive: true } },
    select: { user: { select: { email: true } } },
  });

  if (countOnly) {
    console.log(
      JSON.stringify(
        {
          countOnly: true,
          ...resume,
          enrolled: rawTotal,
          eligible: users.length,
          excludedCount: excluded.length,
          config,
          individuallyPaused: pausedUsers.map((p) => p.user.email),
          subject: SUBJECT,
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
    yieldPercent: YIELD_PERCENT,
    investorsSetTo5: resume.investors,
    enrolled: rawTotal,
    eligible: users.length,
    sent,
    failed,
    excludedCount: excluded.length,
    failedEmails: failedEmails.slice(0, 20),
    notificationsCreated: notifications.created,
    notificationsSkipped: notifications.skipped,
    individuallyPaused: pausedUsers.map((p) => p.user.email),
  };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2));

  try {
    await sendEmail(
      adminEmail,
      `[Trade Guard ops] yield resumed at ${YIELD_PERCENT}% — ${sent}/${users.length}`,
      layout(
        `Daily yield resumed at ${YIELD_PERCENT}%`,
        `<ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
          <li><strong>Investors set to ${YIELD_PERCENT}%:</strong> ${resume.investors}</li>
          <li><strong>Emails sent:</strong> ${sent} / ${users.length}</li>
          <li><strong>Failed:</strong> ${failed}</li>
          <li><strong>In-app notices:</strong> ${notifications.created} (skipped ${notifications.skipped})</li>
          <li><strong>Still individually paused:</strong> ${escapeHtml(marker.individuallyPaused.join(', ') || 'none')}</li>
        </ul>`,
      ),
      `Yield resumed at ${YIELD_PERCENT}%. Sent ${sent}/${users.length}. Failed ${failed}.`,
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
