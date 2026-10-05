/**
 * Investigate + resend emails for Justin (ndayambajejustin2018@gmail.com).
 *
 * Usage: cd backend && npx tsx scripts/resend-justin-emails.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
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

const USER_ID = 'cmtueu02n3rkdi601cphm8mj4';
const ADMIN_EMAIL = 'willeratmit12@gmail.com';
const markerPath = resolve(__dirname, '.sent-justin-email-resend.json');

const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const emailFrom =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';

const prisma = new PrismaClient();

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px"><div style="max-width:640px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px"><h1 style="color:#fff;font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}</div></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">${escapeHtml(label)}</a></p>`;
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!resendKey) {
    return { ok: false as const, error: 'RESEND_API_KEY missing' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: emailFrom, to: [to], subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false as const,
      error: (body as { message?: string }).message ?? `HTTP ${res.status}`,
      body,
    };
  }
  return { ok: true as const, id: (body as { id?: string }).id };
}

async function main() {
  console.log('=== Justin email investigation + resend ===\n');

  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: {
      id: true,
      email: true,
      displayName: true,
      emailVerified: true,
      emailVerifyToken: true,
      status: true,
      createdAt: true,
      lastLoginIp: true,
      registrationPaid: true,
      walletAddress: true,
    },
  });

  if (!user?.email) {
    console.error('User not found or missing email');
    process.exit(1);
  }

  const loginOtps = await prisma.loginOtp.findMany({
    where: { userId: USER_ID },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      email: true,
      createdAt: true,
      expiresAt: true,
      usedAt: true,
      attempts: true,
    },
  });

  const configRows = await prisma.$queryRaw<Array<{ login_otp_enabled: boolean }>>`
    SELECT COALESCE(login_otp_enabled, false) AS login_otp_enabled
    FROM platform_config
    WHERE id = 'default'
    LIMIT 1
  `;
  const loginOtpEnabled = configRows[0]?.login_otp_enabled ?? false;

  const wallet = await prisma.platformWallet.findUnique({
    where: { userId: USER_ID },
    select: { id: true, availableBalance: true, createdAt: true },
  });

  const savedWallets = await prisma.savedWithdrawalWallet.findMany({
    where: { userId: USER_ID },
    select: { id: true, label: true, verifiedAt: true, createdAt: true },
  });

  console.log('User:', JSON.stringify(user, null, 2));
  console.log('Login OTP enabled:', loginOtpEnabled);
  console.log('Recent login OTPs:', JSON.stringify(loginOtps, null, 2));
  console.log('Wallet:', JSON.stringify(wallet, null, 2));
  console.log('Saved withdrawal wallets:', JSON.stringify(savedWallets, null, 2));
  console.log('');

  const results: Array<{ to: string; subject: string; ok: boolean; error?: string; id?: string }> = [];

  // 1. Admin test email
  const testSubject = `[Test] TraderRank email delivery check — ${new Date().toISOString()}`;
  const testHtml = layout(
    'Email delivery test',
    `<p>This is a test email from the TraderRank admin script to confirm Resend delivery is working.</p>
    <p>Triggered for Justin support case: <strong>${escapeHtml(user.email)}</strong> (${USER_ID}).</p>
    <p>Time: ${new Date().toISOString()}</p>`,
  );
  const testResult = await sendEmail(
    ADMIN_EMAIL,
    testSubject,
    testHtml,
    `Email delivery test for Justin case (${user.email}).`,
  );
  results.push({
    to: ADMIN_EMAIL,
    subject: testSubject,
    ok: testResult.ok,
    error: testResult.ok ? undefined : testResult.error,
    id: testResult.ok ? testResult.id : undefined,
  });
  console.log('Admin test:', testResult);

  // Ensure email verify token exists
  let verifyToken = user.emailVerifyToken;
  if (!verifyToken) {
    verifyToken = randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: USER_ID },
      data: { emailVerifyToken: verifyToken },
    });
    console.log('Generated new emailVerifyToken');
  }

  // 2. Email verification link (platform stores token but never auto-emails on signup)
  const verifyUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;
  const verifySubject = 'Verify your TraderRank Pro email address';
  const verifyHtml = layout(
    'Verify your email',
    `<p>Hi ${escapeHtml(user.displayName)},</p>
    <p>Please confirm your email address to finish setting up your TraderRank Pro account.</p>
    ${button(verifyUrl, 'Verify email address')}
    <p style="color:#94a3b8;font-size:14px;">If the button does not work, copy this link:<br/><code style="color:#e2e8f0;word-break:break-all;">${escapeHtml(verifyUrl)}</code></p>
    <p style="color:#94a3b8;font-size:14px;">If you did not create this account, you can ignore this email.</p>`,
  );
  const verifyResult = await sendEmail(
    user.email,
    verifySubject,
    verifyHtml,
    `Hi ${user.displayName}, verify your email: ${verifyUrl}`,
  );
  results.push({
    to: user.email,
    subject: verifySubject,
    ok: verifyResult.ok,
    error: verifyResult.ok ? undefined : verifyResult.error,
    id: verifyResult.ok ? verifyResult.id : undefined,
  });
  console.log('Email verify:', verifyResult);

  // 3. Login guidance + optional OTP if enabled
  if (loginOtpEnabled) {
    await prisma.loginOtp.updateMany({
      where: { userId: USER_ID, usedAt: null },
      data: { usedAt: new Date() },
    });
    const code = String(randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(code, 10);
    const session = await prisma.loginOtp.create({
      data: {
        userId: USER_ID,
        email: user.email,
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const otpSubject = `${code} is your TraderRank Pro sign-in code`;
    const otpHtml = layout(
      'Your sign-in code',
      `<p>Hi ${escapeHtml(user.displayName)},</p>
      <p>Use this code to sign in to TraderRank Pro:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:0.35em;color:#ffffff;margin:16px 0;">${code}</p>
      <p style="color:#94a3b8;font-size:14px;">This code expires in 10 minutes. Enter it on the sign-in page after your password.</p>
      ${button(`${frontendUrl}/login`, 'Go to sign in')}
      <p style="color:#94a3b8;font-size:14px;">If you did not try to sign in, you can ignore this email.</p>`,
    );
    const otpResult = await sendEmail(
      user.email,
      otpSubject,
      otpHtml,
      `Your sign-in code is ${code}. It expires in 10 minutes. Session: ${session.id}`,
    );
    results.push({
      to: user.email,
      subject: otpSubject,
      ok: otpResult.ok,
      error: otpResult.ok ? undefined : otpResult.error,
      id: otpResult.ok ? otpResult.id : undefined,
    });
    console.log('Login OTP:', otpResult, 'session:', session.id);
  } else {
    const loginSubject = 'How to sign in to TraderRank Pro';
    const loginHtml = layout(
      'Sign in to your account',
      `<p>Hi ${escapeHtml(user.displayName)},</p>
      <p>Your account is active. Sign in with the email and password you used when you registered — no email code is required.</p>
      ${button(`${frontendUrl}/login`, 'Sign in now')}
      <p>After signing in, open <strong>Wallet</strong> to deposit USDT or manage your platform balance.</p>
      <p style="color:#94a3b8;font-size:14px;">Forgot your password? Use <a href="${frontendUrl}/forgot-password" style="color:#93c5fd">Forgot password</a> on the sign-in page.</p>`,
    );
    const loginResult = await sendEmail(
      user.email,
      loginSubject,
      loginHtml,
      `Hi ${user.displayName}, sign in at ${frontendUrl}/login with your email and password.`,
    );
    results.push({
      to: user.email,
      subject: loginSubject,
      ok: loginResult.ok,
      error: loginResult.ok ? undefined : loginResult.error,
      id: loginResult.ok ? loginResult.id : undefined,
    });
    console.log('Login guidance:', loginResult);
  }

  // 4. Welcome / wallet guidance
  const welcomeSubject = 'Welcome — your TraderRank Pro account is ready';
  const welcomeHtml = layout(
    'Welcome to TraderRank Pro',
    `<p>Hi ${escapeHtml(user.displayName)},</p>
    <p>Your account is active. Here is what to do next:</p>
    <ol style="color:#cbd5e1;line-height:1.8;padding-left:1.2rem;">
      <li><strong>Verify your email</strong> using the separate verification email we sent.</li>
      <li><strong>Sign in</strong> at the login page with your email and password.</li>
      <li><strong>Open Wallet</strong> to deposit USDT or view your platform balance.</li>
      <li>To <strong>withdraw later</strong>, save a withdrawal wallet in Wallet settings — we email a 6-digit code to verify each saved wallet.</li>
    </ol>
    ${button(`${frontendUrl}/wallet`, 'Open wallet')}
    <p style="color:#94a3b8;font-size:14px;">Need help? Reply via Messages in your dashboard or contact support.</p>`,
  );
  const welcomeResult = await sendEmail(
    user.email,
    welcomeSubject,
    welcomeHtml,
    `Hi ${user.displayName}, your TraderRank Pro account is active. Sign in at ${frontendUrl}/login then open ${frontendUrl}/wallet.`,
  );
  results.push({
    to: user.email,
    subject: welcomeSubject,
    ok: welcomeResult.ok,
    error: welcomeResult.ok ? undefined : welcomeResult.error,
    id: welcomeResult.ok ? welcomeResult.id : undefined,
  });
  console.log('Welcome:', welcomeResult);

  writeFileSync(
    markerPath,
    JSON.stringify({ sentAt: new Date().toISOString(), results, user: { id: user.id, email: user.email }, loginOtpEnabled }, null, 2),
  );

  console.log('\n=== Summary ===');
  for (const r of results) {
    console.log(`${r.ok ? 'OK' : 'FAIL'} → ${r.to} | ${r.subject}${r.error ? ` | ${r.error}` : ''}${r.id ? ` | id=${r.id}` : ''}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
