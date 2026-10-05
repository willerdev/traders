/**
 * Optional all-users notice: 40% withdrawals by Saturday 26 Sep 2026,
 * remaining Smart Invest members get 20% of profits weekly during up to 14 days
 * of maintenance, and how to opt out. Also opens the maintenance window in
 * platform_config (pauses daily yield; weekly 20% job can credit).
 *
 * Usage:
 *   cd backend && npx tsx scripts/broadcast-opt-out-and-maintenance.ts
 *   cd backend && COUNT_ONLY=1 npx tsx scripts/broadcast-opt-out-and-maintenance.ts
 *   cd backend && FORCE=1 npx tsx scripts/broadcast-opt-out-and-maintenance.ts
 *
 * Do not run until the UI has been reviewed locally.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  INVESTOR_MAINTENANCE_DAYS,
  INVESTOR_WEEKLY_PROFIT_FRACTION,
  WITHDRAW_40_BY_SATURDAY_LABEL,
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
const frontendUrl = 'https://thetradeguard.com';
const force = process.env.FORCE === '1';
const countOnly = process.env.COUNT_ONLY === '1';
const skipEnable = process.env.SKIP_ENABLE === '1';
const adminEmail = 'willeratmit12@gmail.com';
const markerPath = resolve(__dirname, '.sent-opt-out-and-maintenance.json');

const SUBJECT =
  'Trade Guard: 40% withdrawals by Saturday, weekly profit share, Smart Invest opt-out';

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
    'Withdrawals, maintenance, and Smart Invest',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>We are completing planned system work. Here is what this means for you:</p>
    <p><strong>Withdrawals:</strong> Everyone who requested a wallet withdrawal — including members ending Smart Invest — will receive the <strong>40%</strong> send by <strong>${WITHDRAW_40_BY_SATURDAY_LABEL}</strong> (Africa/Kampala).</p>
    <p><strong>If you stay in Smart Invest:</strong> Daily yield is paused during maintenance (up to ${INVESTOR_MAINTENANCE_DAYS} days). Remaining members receive <strong>${INVESTOR_WEEKLY_PROFIT_FRACTION * 100}% of total profits per week</strong> until the system is back to normal.</p>
    <p><strong>If you want to end Smart Invest:</strong> Open Invest and use <em>End Smart Invest</em>. It takes <strong>5 business days</strong>. Your <strong>capital is returned</strong>. Full profits are <strong>not guaranteed</strong> — yield already in your wallet stays; future daily yield is not paid. On business day 3 you receive a refund-status report.</p>
    <p>
      <a href="${frontendUrl}/invest" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Smart Invest</a>
    </p>`,
  );
  const text = `Hi ${name},

Withdrawals: the 40% send is due by ${WITHDRAW_40_BY_SATURDAY_LABEL} for everyone, including members who opt out of Smart Invest.

If you stay invested: daily yield pauses during maintenance (up to ${INVESTOR_MAINTENANCE_DAYS} days). Remaining members receive ${INVESTOR_WEEKLY_PROFIT_FRACTION * 100}% of total profits per week until we are fully online.

To end Smart Invest: Invest → End Smart Invest. 5 business days. Capital is returned. Full profits are not guaranteed. Day 3 report included.

${frontendUrl}/invest`;
  return { subject: SUBJECT, html, text };
}

async function enableMaintenance() {
  const now = new Date();
  const until = new Date(
    now.getTime() + INVESTOR_MAINTENANCE_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.platformConfig.update({
    where: { id: 'default' },
    data: {
      investorMaintenanceUntil: until,
      investorWeeklyProfitFraction: INVESTOR_WEEKLY_PROFIT_FRACTION,
      investorProfitSnapshotAt: now,
      ...(countOnly
        ? {}
        : { investorMaintenanceAnnouncedAt: now }),
    },
  });

  const cooling = await prisma.investorOptOut.findMany({
    where: { status: 'COOLING' },
    select: { userId: true },
  });
  const skip = new Set(cooling.map((r) => r.userId));
  const investors = await prisma.user.findMany({
    where: { investorActive: true },
    include: { investorSettings: true },
  });
  for (const user of investors) {
    if (skip.has(user.id)) continue;
    if (user.investorSettings?.maintenanceProfitSnapshot != null) continue;
    const [trading, credits] = await Promise.all([
      prisma.investorTrade.aggregate({
        where: { userId: user.id, status: 'CLOSED', profit: { not: null } },
        _sum: { profit: true },
      }),
      prisma.investorDailyCredit.aggregate({
        where: { userId: user.id },
        _sum: { amount: true },
      }),
    ]);
    const profit = Math.round(
      (Number(trading._sum.profit ?? 0) + Number(credits._sum.amount ?? 0)) * 100,
    ) / 100;
    await prisma.investorSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, maintenanceProfitSnapshot: profit },
      update: { maintenanceProfitSnapshot: profit },
    });
  }
  return until;
}

async function main() {
  const until = skipEnable ? null : await enableMaintenance();

  const raw = await prisma.user.findMany({
    where: { email: { not: null }, status: { not: 'BANNED' } },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  });
  const users = raw.filter((u) => {
    const email = u.email?.trim().toLowerCase();
    return email && !isExcludedEmail(email);
  });

  if (countOnly) {
    console.log(
      JSON.stringify(
        {
          countOnly: true,
          eligible: users.length,
          maintenanceUntil: until?.toISOString() ?? null,
          subject: SUBJECT,
        },
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    return;
  }

  if (existsSync(markerPath) && !force) {
    console.log(
      JSON.stringify({
        skipped: true,
        hint: 'Set FORCE=1 to send again',
        marker: markerPath,
      }),
    );
    await prisma.$disconnect();
    return;
  }

  let sent = 0;
  let failed = 0;
  const failedEmails: string[] = [];
  for (const user of users) {
    const email = user.email!.trim().toLowerCase();
    const { html, text } = buildEmail(user.displayName || 'there');
    try {
      await sendEmail(email, SUBJECT, html, text);
      sent++;
    } catch {
      failed++;
      failedEmails.push(email);
    }
  }

  const adminHtml = layout(
    'Broadcast sent — opt-out and maintenance',
    `<p>Eligible ${users.length} · sent ${sent} · failed ${failed}.</p>
     <p>Maintenance until: ${until ? escapeHtml(until.toISOString()) : 'unchanged'}.</p>`,
  );
  await sendEmail(
    adminEmail,
    `[Trade Guard ops] opt-out/maintenance broadcast — ${sent}/${users.length}`,
    adminHtml,
    `Sent ${sent}/${users.length}. Failed ${failed}.`,
  );

  writeFileSync(
    markerPath,
    JSON.stringify(
      {
        sentAt: new Date().toISOString(),
        sent,
        failed,
        eligible: users.length,
        maintenanceUntil: until?.toISOString() ?? null,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, sent, failed, eligible: users.length, until }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
