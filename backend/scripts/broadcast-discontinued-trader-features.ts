/**
 * Notify active/invested users that legacy trader revenue features are discontinued.
 * Usage: cd backend && npx tsx scripts/broadcast-discontinued-trader-features.ts
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

const ANNOUNCE_FIELD = 'traderFeaturesDiscontinuedAnnouncedAt';

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

async function collectAffectedUserIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  const [
    activeTraders,
    registrationPaid,
    profitShare,
    setupPlans,
    mt5Sync,
    tierPayouts,
    smartInvestAllocates,
    smartInvestEnrolled,
    smartInvestCredits,
    smartInvestTrades,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { status: 'ACTIVE', role: { not: 'ADMIN' } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { registrationPaid: true },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { profitShareActive: true },
      select: { id: true },
    }),
    prisma.subscription.findMany({
      where: { plan: { in: ['PREMIUM', 'PRO'] }, isActive: true },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { mt5SyncActive: true },
          { mt5SyncEnrolledAt: { not: null } },
        ],
      },
      select: { id: true },
    }),
    prisma.payout.findMany({
      where: { rewardTier: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    }),
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

  for (const row of activeTraders) ids.add(row.id);
  for (const row of registrationPaid) ids.add(row.id);
  for (const row of profitShare) ids.add(row.id);
  for (const row of setupPlans) ids.add(row.userId);
  for (const row of mt5Sync) ids.add(row.id);
  for (const row of tierPayouts) ids.add(row.userId);
  for (const row of smartInvestAllocates) ids.add(row.userId);
  for (const row of smartInvestEnrolled) ids.add(row.id);
  for (const row of smartInvestCredits) ids.add(row.userId);
  for (const row of smartInvestTrades) ids.add(row.userId);

  return ids;
}

function buildEmail(name: string) {
  const subject = 'Trade Guard update: changes to trader features';
  const html = layout(
    'Platform update — trader features simplified',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>We are simplifying Trade Guard by removing several paid trader add-ons. Here is what is changing:</p>
    <ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
      <li><strong>Weekly trading access ($5/week)</strong> — removed. Active accounts can trade without renewal.</li>
      <li><strong>Setup plan subscriptions (Premium / Pro)</strong> — removed. Setup submissions are unlimited.</li>
      <li><strong>Profit share &amp; copy-trading commissions</strong> — removed. New enrollments and commission billing are discontinued.</li>
      <li><strong>MT5 Live Sync subscription ($5/week)</strong> — removed. Linked MT5 accounts sync at no extra cost.</li>
      <li><strong>Weekly tier payouts (Starter / Pro / Elite)</strong> — removed. No new tier payout records will be created.</li>
    </ul>
    <p><strong>What you can still use:</strong> Smart Invest, wallet deposits &amp; withdrawals, evaluations, MT5 trading, Unitrust, Airfarming, blockchain features, and support.</p>
    <p>If you had an open profit-share balance or pending tier payout, contact support and we will help you directly.</p>
    <p><a href="${frontendUrl}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open dashboard</a></p>
    <p style="color:#64748b;font-size:13px;margin-top:20px;">Thank you for being part of Trade Guard.</p>`,
  );
  const text = `Hi ${name}, Trade Guard is removing weekly access fees, setup plan subscriptions, profit share/copy commissions, MT5 sync subscription, and weekly tier payouts. Smart Invest, wallet, evaluations, and core trading remain. Dashboard: ${frontendUrl}/dashboard`;
  return { subject, html, text };
}

async function main() {
  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
  });
  const announcedAt = config
    ? (config as Record<string, unknown>)[ANNOUNCE_FIELD]
    : null;
  if (announcedAt && !force) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          announcedAt,
          hint: 'Set FORCE=1 to send again',
        },
        null,
        2,
      ),
    );
    return;
  }

  const affectedIds = await collectAffectedUserIds();
  const users = await prisma.user.findMany({
    where: {
      id: { in: [...affectedIds] },
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

  const now = new Date();
  await prisma.$executeRawUnsafe(
    `UPDATE "platform_config" SET "traderFeaturesDiscontinuedAnnouncedAt" = $1 WHERE id = 'default'`,
    now,
  ).catch(async () => {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "traderFeaturesDiscontinuedAnnouncedAt" TIMESTAMPTZ`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "platform_config" SET "traderFeaturesDiscontinuedAnnouncedAt" = $1 WHERE id = 'default'`,
      now,
    );
  });

  console.log(
    JSON.stringify(
      {
        skipped: false,
        affectedIds: affectedIds.size,
        total: users.length,
        sent,
        failed,
        announcedAt: now.toISOString(),
        sampleSubject: 'Trade Guard update: changes to trader features',
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
