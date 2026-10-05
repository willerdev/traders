/**
 * Admin DM + email: Sammy's account was assessed; funds resume next week.
 *
 * Usage: cd backend && npx tsx scripts/notify-sammy-funds-next-week.ts
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

const USER_ID = 'cmsg0a74d069iku01m7skci5y';
const EMAIL = 'mugerwas@gmail.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const markerPath = resolve(
  __dirname,
  '.sent-sammy-funds-next-week.json',
);

const prisma = new PrismaClient();
const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const emailFrom =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';
const force = process.env.FORCE === '1';

const SUBJECT =
  'Trade Guard: your account has been assessed — funds from next week';

const ADMIN_DM = `Hi Sammy,

Your account has been assessed by our team.

You should be able to receive your funds back starting next week (from Monday 21 September 2026).

Until then, withdrawals across the platform are temporarily limited to 40% of available wallet funds because of ongoing system maintenance. Withdrawal fees are waived during this period. This is temporary and is being fixed.

If you have questions, reply here and we will help.

— Trade Guard admin`;

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

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!resendKey) throw new Error('RESEND_API_KEY missing');
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: emailFrom, to: [to], subject, html, text }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { id?: string };
        return body.id ?? null;
      }
      lastErr = await res.text();
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 400));
  }
  throw new Error(lastErr);
}

async function main() {
  if (existsSync(markerPath) && !force) {
    console.log(
      JSON.stringify({
        skipped: true,
        marker: JSON.parse(readFileSync(markerPath, 'utf8')),
        hint: 'Set FORCE=1 to send again',
      }),
    );
    return;
  }

  const [user, admin] = await Promise.all([
    prisma.user.findUnique({
      where: { id: USER_ID },
      select: { id: true, email: true, displayName: true, status: true },
    }),
    prisma.user.findUnique({
      where: { id: ADMIN_ID },
      select: { id: true, role: true, displayName: true },
    }),
  ]);

  if (!user) throw new Error(`User ${USER_ID} not found`);
  if (!admin || admin.role !== 'ADMIN') {
    throw new Error(`Admin ${ADMIN_ID} missing or not ADMIN`);
  }

  const email = user.email?.trim().toLowerCase() || EMAIL;
  const name = user.displayName?.trim() || 'Sammy';

  await prisma.messageThreadState.upsert({
    where: { userId: USER_ID },
    create: {
      userId: USER_ID,
      agentEnabled: false,
      escalatedAt: new Date(),
    },
    update: { agentEnabled: false, escalatedAt: new Date() },
  });

  const dm = await prisma.directMessage.create({
    data: {
      userId: USER_ID,
      senderId: ADMIN_ID,
      senderRole: 'ADMIN',
      body: ADMIN_DM,
      isAgent: false,
    },
  });

  const html = layout(
    'Your account has been assessed',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>Your Trade Guard account has been <strong>assessed</strong> by our team.</p>
    <p style="background:#334155;border-left:4px solid #22c55e;padding:12px 14px;border-radius:8px;color:#bbf7d0;font-size:14px;line-height:1.6;margin:20px 0;">
      You should be able to get your funds back <strong>starting next week</strong> (from Monday 21 September 2026).
    </p>
    <p>Until then, withdrawals across the platform are temporarily limited to <strong>40% of available wallet funds</strong> because of ongoing system maintenance. <strong>Withdrawal fees are waived</strong> during this period. This is temporary and is being fixed.</p>
    <p>We also sent this update in your in-app admin messages. Reply there if you need anything.</p>
    <p>
      <a href="${frontendUrl}/messages" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px">Open messages</a>
      <a href="${frontendUrl}/wallet" style="display:inline-block;background:#334155;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a>
    </p>
    <p style="color:#64748b;font-size:13px;margin-top:20px;">Thank you for your patience.</p>`,
  );
  const text = [
    `Hi ${name},`,
    '',
    'Your Trade Guard account has been assessed by our team.',
    '',
    'You should be able to get your funds back starting next week (from Monday 21 September 2026).',
    '',
    'Until then, withdrawals across the platform are temporarily limited to 40% of available wallet funds because of ongoing system maintenance. Withdrawal fees are waived during this period. This is temporary and is being fixed.',
    '',
    `Messages: ${frontendUrl}/messages`,
    `Wallet: ${frontendUrl}/wallet`,
  ].join('\n');

  const resendId = await sendEmail(email, SUBJECT, html, text);

  const marker = {
    sentAt: new Date().toISOString(),
    userId: USER_ID,
    email,
    directMessageId: dm.id,
    resendId,
    subject: SUBJECT,
  };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2));
  console.log(JSON.stringify(marker, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
