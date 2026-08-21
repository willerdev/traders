/**
 * Email every user who has ever invested in Smart Invest about Airfarming.
 * Usage: cd backend && npx tsx scripts/broadcast-airfarming-to-smart-investors.ts
 * Re-run safely blocked after first success unless FORCE=1.
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
  'Trade Guard <noreply@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';
const force = process.env.FORCE === '1';

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

async function collectSmartInvestAlumniIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  const [allocates, enrolled, credits, trades] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { type: 'INVESTOR_ALLOCATE' },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.user.findMany({
      where: { investorEnrolledAt: { not: null } },
      select: { id: true },
    }),
    prisma.investorDailyCredit.findMany({
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.investorTrade.findMany({
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  for (const row of allocates) ids.add(row.userId);
  for (const row of enrolled) ids.add(row.id);
  for (const row of credits) ids.add(row.userId);
  for (const row of trades) ids.add(row.userId);

  return ids;
}

function buildEmail(name: string) {
  const html = layout(
    'Try Airfarming — a new way to earn',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>You have used <strong>Smart Invest</strong> on Trade Guard — we built something new for investors like you.</p>
    <p><strong>Airfarming</strong> is a scheduled yield program: commit cash from your wallet, receive natural yield drops throughout the week, and get at least <strong>50% of your weekly commitment</strong> by UTC week end.</p>
    <ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
      <li>Funds stay in your cash wallet between drops</li>
      <li>Automatic float prep before each drop</li>
      <li>Email notification for every activity once you are approved</li>
      <li>Choose weekly, monthly, or yearly withdraw preference when you apply</li>
    </ul>
    <p>Apply in a few minutes — tell us your planned investment, location, and how you want to withdraw. Our team reviews each application.</p>
    <p><a href="${frontendUrl}/airfarming" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Apply for Airfarming</a></p>
    <p style="color:#64748b;font-size:13px;margin-top:20px;">Only invest what you can afford. Airfarming involves risk; past Smart Invest performance does not guarantee future Airfarming results.</p>`,
  );
  const text = `Hi ${name}, you have used Smart Invest — try Airfarming: scheduled yield drops with a weekly floor. Apply at ${frontendUrl}/airfarming`;
  return {
    subject: 'New for Smart Invest members: try Airfarming',
    html,
    text,
  };
}

async function main() {
  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
    select: { airfarmingLaunchAnnouncedAt: true },
  });
  if (config?.airfarmingLaunchAnnouncedAt && !force) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          announcedAt: config.airfarmingLaunchAnnouncedAt.toISOString(),
          hint: 'Set FORCE=1 to send again',
        },
        null,
        2,
      ),
    );
    return;
  }

  const alumniIds = await collectSmartInvestAlumniIds();
  const users = await prisma.user.findMany({
    where: {
      id: { in: [...alumniIds] },
      email: { not: null },
      status: { not: 'BANNED' },
    },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    const email = user.email?.trim().toLowerCase();
    if (!email) continue;
    const name = user.displayName?.trim() || 'there';
    const { subject, html, text } = buildEmail(name);
    try {
      await sendEmail(email, subject, html, text);
      sent++;
      console.log(`sent ${email}`);
    } catch (err) {
      failed++;
      console.error(`failed ${email}`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  const announcedAt = new Date();
  await prisma.platformConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', airfarmingLaunchAnnouncedAt: announcedAt },
    update: { airfarmingLaunchAnnouncedAt: announcedAt },
  });

  console.log(
    JSON.stringify(
      {
        skipped: false,
        alumniIds: alumniIds.size,
        total: users.length,
        sent,
        failed,
        announcedAt: announcedAt.toISOString(),
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
