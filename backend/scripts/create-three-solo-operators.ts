/**
 * Create three Soloema trade operators (role TRADER) and email them + admin.
 * Passwords via env: SOLO_OLIVIER_PASSWORD, SOLO_EJOEL_PASSWORD, SOLO_KIGALI_PASSWORD
 *
 * Usage: DATABASE_URL=... npx tsx scripts/create-three-solo-operators.ts
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

const LOGIN_URL = 'https://soloema-web.onrender.com/login';
const prisma = new PrismaClient();
const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'soloRukundo <noreply@thetradeguard.com>';
const adminEmail = 'willeratmit12@gmail.com';

const ACCOUNTS = [
  {
    email: 'olivierrwandanfx@gmail.com',
    displayName: 'Olivier',
    password: process.env.SOLO_OLIVIER_PASSWORD,
  },
  {
    email: 'ejoel4838@gmail.com',
    displayName: 'Ejoel',
    password: process.env.SOLO_EJOEL_PASSWORD,
  },
  {
    email: 'kigalihyperzone@gmail.com',
    displayName: 'Kigali Hyperzone',
    password: process.env.SOLO_KIGALI_PASSWORD,
  },
] as const;

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

async function upsertOperator(input: {
  email: string;
  displayName: string;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const now = new Date();
  let user = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: 'insensitive' } },
  });
  let created = false;
  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        displayName: input.displayName,
        status: 'ACTIVE',
        emailVerified: true,
        registrationPaid: true,
        role: 'TRADER',
        soloTradeOperator: true,
        soloMaxRiskPercent: 5,
        autoWithdrawEligible: true,
        autoWithdrawEligibleAt: user.autoWithdrawEligibleAt ?? now,
      },
    });
  } else {
    created = true;
    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        role: 'TRADER',
        status: 'ACTIVE',
        emailVerified: true,
        registrationPaid: true,
        termsAcceptedAt: now,
        referralCode: randomBytes(4).toString('hex').toUpperCase(),
        soloTradeOperator: true,
        soloMaxRiskPercent: 5,
        autoWithdrawEligible: true,
        autoWithdrawEligibleAt: now,
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
    <h1 style="color:#c4a35a;font-size:20px">Your soloRukundo trading account</h1>
    <p>Hi ${escapeHtml(input.displayName)},</p>
    <p>Your trader account is ready. You can place and manage live trades, and withdraw the profits you make.</p>
    <p><strong>Email:</strong> ${escapeHtml(input.email)}<br>
    <strong>Password:</strong> ${escapeHtml(input.password)}</p>
    <p>Sign in, open MT5, and use Wallet to withdraw your trading profit.</p>
    <p><a href="${LOGIN_URL}" style="display:inline-block;background:#c4a35a;color:#0c1410;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>
  </div></body></html>`;
  const text = `Hi ${input.displayName},

Your soloRukundo trading account is ready.

Email: ${input.email}
Password: ${input.password}

Sign in: ${LOGIN_URL}

You can place live trades and withdraw the profits you make.`;

  await sendEmail(
    input.email,
    'Your soloRukundo trading account is ready',
    html,
    text,
  );

  return { id: user.id, email: input.email, created };
}

async function main() {
  for (const a of ACCOUNTS) {
    if (!a.password) {
      throw new Error(`Missing password env for ${a.email}`);
    }
  }

  const probe = await prisma.user.findFirst({
    where: { email: { equals: 'etuyizere64@gmail.com', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!probe) throw new Error('Wrong database (etuyizere64 missing) — abort');

  const results: Array<{ id: string; email: string; created: boolean }> = [];
  for (const a of ACCOUNTS) {
    results.push(
      await upsertOperator({
        email: a.email,
        displayName: a.displayName,
        password: a.password as string,
      }),
    );
  }

  const lines = results
    .map((r) => `${r.email} (${r.created ? 'created' : 'updated'}) ${r.id}`)
    .join('\n');
  await sendEmail(
    adminEmail,
    '[soloRukundo] Three trader operator accounts',
    `<pre>${escapeHtml(lines)}</pre><p>Role TRADER, soloTradeOperator true, max risk 1%. They can trade and withdraw their own profits.</p>`,
    lines,
  );

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
