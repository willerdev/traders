/**
 * Email active Smart Invest users about self-serve reinvest (30% commission).
 * Usage: cd backend && npx tsx scripts/broadcast-investor-reinvest-policy.ts
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

function buildEmail(name: string) {
  const html = layout(
    'Smart Invest update: reinvest is back',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>You can again move earnings from your <strong>wallet</strong> back into <strong>Smart Invest</strong> from the Invest page.</p>
    <p><strong>How it works</strong></p>
    <ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
      <li>Open <strong>Invest → Move funds → Wallet → Investment</strong></li>
      <li>A <strong>30% commission</strong> is deducted from the amount you move; the remainder is added to your investment balance</li>
      <li>Example: reinvest <strong>$100</strong> from wallet → <strong>$70</strong> added to Smart Invest ($30 commission)</li>
      <li>New allocations still follow the <strong>24-hour yield hold</strong> before they earn daily yield</li>
      <li>If you have an <strong>open loan</strong>, reinvest stays paused until you repay</li>
      <li><strong>VVIP</strong> members: no commission on reinvest (unchanged)</li>
    </ul>
    <p>Auto-reinvest (automatic compounding of daily earnings) remains off — use manual reinvest when you choose.</p>
    <p><a href="${frontendUrl}/invest" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Invest</a></p>`,
  );
  const text = `Hi ${name}, Smart Invest reinvest is back on Invest. Move wallet → investment with a 30% commission on the amount moved (VVIP: no fee). Example: $100 moved → $70 to investment. Open ${frontendUrl}/invest`;
  return {
    subject: 'Smart Invest: wallet → investment reinvest is available (30% fee)',
    html,
    text,
  };
}

async function main() {
  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
    select: { investorReinvestPolicyAnnouncedAt: true },
  });
  if (config?.investorReinvestPolicyAnnouncedAt && !force) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          announcedAt: config.investorReinvestPolicyAnnouncedAt.toISOString(),
          hint: 'Set FORCE=1 to send again',
        },
        null,
        2,
      ),
    );
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      investorActive: true,
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
    create: { id: 'default', investorReinvestPolicyAnnouncedAt: announcedAt },
    update: { investorReinvestPolicyAnnouncedAt: announcedAt },
  });

  console.log(
    JSON.stringify(
      {
        skipped: false,
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
