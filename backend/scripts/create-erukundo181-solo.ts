/**
 * Create soloRukundo account and email the user + admin.
 * DATABASE_URL must be Soloema. RESEND_* from backend/.env.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
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

const EMAIL = 'erukundo181@gmail.com';
const DISPLAY_NAME = 'Rukundo';
const PASSWORD = process.env.SOLO_NEW_USER_PASSWORD;
if (!PASSWORD) throw new Error('SOLO_NEW_USER_PASSWORD is required');

const LOGIN_URL = 'https://soloema-web.onrender.com/login';
const prisma = new PrismaClient();
const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'soloRukundo <noreply@thetradeguard.com>';
const adminEmail = 'willeratmit12@gmail.com';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
        body: JSON.stringify({ from, to: [to], subject, html, text }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return true;
      lastErr = await res.text();
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 400));
  }
  throw new Error(lastErr);
}

async function main() {
  const probe = await prisma.user.findFirst({
    where: { email: { equals: 'etuyizere64@gmail.com', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!probe) throw new Error('Wrong database (etuyizere64 missing) — abort');

  let user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const now = new Date();
  let created = false;

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: 'ACTIVE',
        emailVerified: true,
        registrationPaid: true,
      },
    });
  } else {
    created = true;
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        passwordHash,
        displayName: DISPLAY_NAME,
        role: 'TRADER',
        status: 'ACTIVE',
        emailVerified: true,
        registrationPaid: true,
        termsAcceptedAt: now,
        referralCode: randomBytes(4).toString('hex').toUpperCase(),
      },
    });
    await prisma.virtualAccount.create({
      data: {
        userId: user.id,
        balance: 1000,
        maxRiskPerTrade: 50,
        riskPercent: 5,
      },
    });
    await prisma.platformWallet.create({ data: { userId: user.id } });
    await prisma.kycVerification.create({
      data: { userId: user.id, status: 'NOT_STARTED' },
    });
  }

  const html = `<!DOCTYPE html><html><body style="background:#0c1410;color:#f4f1ea;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#14201a;border-radius:12px;padding:24px">
    <h1 style="color:#c4a35a;font-size:20px">Your soloRukundo account</h1>
    <p>Hi ${escapeHtml(DISPLAY_NAME)},</p>
    <p>Your account is ready. Sign in with:</p>
    <p><strong>Email:</strong> ${escapeHtml(EMAIL)}<br>
    <strong>Password:</strong> ${escapeHtml(PASSWORD)}</p>
    <p>You can change the password after you sign in, or use Forgot password on the login page.</p>
    <p><a href="${LOGIN_URL}" style="display:inline-block;background:#c4a35a;color:#0c1410;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>
  </div></body></html>`;

  const text = `Hi ${DISPLAY_NAME},

Your soloRukundo account is ready.

Email: ${EMAIL}
Password: ${PASSWORD}

Sign in: ${LOGIN_URL}

You can change the password after you sign in.`;

  await sendEmail(
    EMAIL,
    'Your soloRukundo account is ready',
    html,
    text,
  );

  await sendEmail(
    adminEmail,
    `[soloRukundo] Account ${created ? 'created' : 'updated'} — ${DISPLAY_NAME} (${EMAIL})`,
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px">
<p><strong>${escapeHtml(DISPLAY_NAME)}</strong> (${escapeHtml(EMAIL)})</p>
<p>User id: ${escapeHtml(user.id)}</p>
<p>${created ? 'New account created' : 'Existing account password updated'} on Soloema. Login emailed to the user.</p>
<p>Sign in: ${LOGIN_URL}</p>
</body></html>`,
    `${DISPLAY_NAME} ${EMAIL} ${created ? 'created' : 'updated'}. Login emailed. ${LOGIN_URL}`,
  );

  console.log(
    JSON.stringify({
      ok: true,
      created,
      userId: user.id,
      email: EMAIL,
      displayName: DISPLAY_NAME,
      emails: { user: true, admin: true },
      loginUrl: LOGIN_URL,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
