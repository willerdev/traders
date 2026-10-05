/**
 * Create Solo web (soloema-web) investor login for fizzlerose1derrick@gmail.com.
 * DATABASE_URL must be Soloema. Not Trade Guard.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/create-fizzlerose-soloweb-investor.ts
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

const EMAIL = 'fizzlerose1derrick@gmail.com';
const DISPLAY_NAME = 'Feza';
const PASSWORD = 'Kigali@2015';
const LOGIN_URL = 'https://soloema-web.onrender.com/login';
const INVEST_URL = 'https://soloema-web.onrender.com/invest';
const ADMIN_EMAIL = 'willeratmit12@gmail.com';

const prisma = new PrismaClient();
const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'soloRukundo <noreply@thetradeguard.com>';

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
  const db = process.env.DATABASE_URL || '';
  if (db.includes('flat-pond') || db.includes('ep-') && db.includes('us-east-1') && db.includes('traders')) {
    // soft check — primary probe below
  }

  const probe = await prisma.user.findFirst({
    where: { email: { equals: 'etuyizere64@gmail.com', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!probe) {
    throw new Error('Wrong database (etuyizere64 missing) — abort. Use Soloema DATABASE_URL.');
  }
  const tgProbe = await prisma.user.findFirst({
    where: { email: { equals: 'nelysa2020@gmail.com', mode: 'insensitive' } },
    select: { id: true },
  });
  if (tgProbe) {
    throw new Error('This looks like Trade Guard (nelysa2020 present) — abort.');
  }

  let user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const now = new Date();
  let created = false;

  if (user) {
    if (user.role === 'ADMIN') {
      throw new Error('Refusing to overwrite an ADMIN account');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        displayName: DISPLAY_NAME,
        role: 'TRADER',
        status: 'ACTIVE',
        emailVerified: true,
        registrationPaid: true,
        investorActive: true,
        investorEnrolledAt: user.investorEnrolledAt ?? now,
        soloTradeOperator: false,
        adminCanApproveKyc: false,
        adminCanApprovePayouts: false,
        adminCanApproveTpClaims: false,
        adminCanManageSetups: false,
        adminCanManageCopy: false,
      },
    });
    if (!(await prisma.platformWallet.findUnique({ where: { userId: user.id } }))) {
      await prisma.platformWallet.create({ data: { userId: user.id } });
    }
    if (!(await prisma.kycVerification.findUnique({ where: { userId: user.id } }))) {
      await prisma.kycVerification.create({
        data: { userId: user.id, status: 'NOT_STARTED' },
      });
    }
    await prisma.$executeRaw`
      INSERT INTO investor_settings (
        id, "userId", "riskPercent", "useTwoToOneRr", paused, "yieldPaused",
        "minBalanceExempt", "autoReinvestEarnings", "lastHealthReady",
        "createdAt", "updatedAt"
      )
      SELECT ${'invset_' + user.id.slice(-16)}, ${user.id}, 2, true, false, false,
        false, false, false, NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM investor_settings WHERE "userId" = ${user.id}
      )
    `;
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
        investorActive: true,
        investorEnrolledAt: now,
        soloTradeOperator: false,
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
    await prisma.$executeRaw`
      INSERT INTO investor_settings (
        id, "userId", "riskPercent", "useTwoToOneRr", paused, "yieldPaused",
        "minBalanceExempt", "autoReinvestEarnings", "lastHealthReady",
        "createdAt", "updatedAt"
      )
      VALUES (
        ${'invset_' + user.id.slice(-16)}, ${user.id}, 2, true, false, false,
        false, false, false, NOW(), NOW()
      )
    `;
    await prisma.kycVerification.create({
      data: { userId: user.id, status: 'NOT_STARTED' },
    });
  }

  const userHtml = `<!DOCTYPE html><html><body style="background:#0c1410;color:#f4f1ea;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#14201a;border-radius:12px;padding:24px">
    <h1 style="color:#c4a35a;font-size:20px">Your Solo investor account</h1>
    <p>Hi ${escapeHtml(DISPLAY_NAME)},</p>
    <p>Your <strong>investor</strong> account is ready. This is not a trader or admin login.</p>
    <p><strong>Email:</strong> ${escapeHtml(EMAIL)}<br>
    <strong>Password:</strong> ${escapeHtml(PASSWORD)}</p>
    <p>Sign in, then open Invest to manage your investment.</p>
    <p><a href="${LOGIN_URL}" style="display:inline-block;background:#c4a35a;color:#0c1410;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a>
    &nbsp;<a href="${INVEST_URL}" style="display:inline-block;padding:12px 18px;color:#c4a35a">Invest</a></p>
    <p style="color:#9ca3af;font-size:13px">You can change the password after you sign in.</p>
  </div></body></html>`;

  const userText = `Hi ${DISPLAY_NAME},

Your Solo investor account is ready (not trader, not admin).

Email: ${EMAIL}
Password: ${PASSWORD}

Sign in: ${LOGIN_URL}
Invest: ${INVEST_URL}

You can change the password after you sign in.`;

  await sendEmail(EMAIL, 'Your Solo investor account is ready', userHtml, userText);

  const adminHtml = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;background:#0f172a;color:#e2e8f0">
  <div style="max-width:640px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:18px">Solo web investor account</h1>
    <p>Copy of login created for <strong>${escapeHtml(DISPLAY_NAME)}</strong>.</p>
    <table style="font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#94a3b8">User id</td><td>${escapeHtml(user.id)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#94a3b8">Email</td><td>${escapeHtml(EMAIL)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#94a3b8">Password</td><td>${escapeHtml(PASSWORD)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#94a3b8">Type</td><td>Investor (not trader operator, not admin)</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#94a3b8">Site</td><td>Solo web — ${escapeHtml(LOGIN_URL)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#94a3b8">Action</td><td>${created ? 'Created' : 'Updated existing'}</td></tr>
    </table>
  </div></body></html>`;

  await sendEmail(
    ADMIN_EMAIL,
    `[Solo web] Investor account ${created ? 'created' : 'updated'} — ${DISPLAY_NAME} (${EMAIL})`,
    adminHtml,
    `Solo web investor ${created ? 'created' : 'updated'}: ${DISPLAY_NAME} ${EMAIL} password ${PASSWORD} ${LOGIN_URL}`,
  );

  console.log(
    JSON.stringify({
      ok: true,
      created,
      userId: user.id,
      email: EMAIL,
      displayName: DISPLAY_NAME,
      investorActive: true,
      soloTradeOperator: false,
      role: 'TRADER',
      loginUrl: LOGIN_URL,
      emails: { user: true, admin: true },
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
