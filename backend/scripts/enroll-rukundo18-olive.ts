/**
 * Credit $4100, enroll Smart Invest (fee waived), instant yield — Olive.
 * Usage: cd backend && npx tsx scripts/enroll-rukundo18-olive.ts
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

const USER_ID = 'cmt8bko1k0id7lo01tjxgzeke';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'rukundo18@gmail.com';
const DEPOSIT_USDT = 4100;
const INVEST_USDT = 4100;

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

async function sendEmail(to: string, subject: string, html: string, text: string) {
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
      if (res.ok) return true;
      lastErr = await res.text();
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 400));
  }
  throw new Error(lastErr);
}

async function creditWallet(
  userId: string,
  amount: number,
  description: string,
  referenceId: string,
) {
  const wallet = await prisma.platformWallet.findUnique({ where: { userId } });
  if (!wallet) await prisma.platformWallet.create({ data: { userId } });
  const current = Number(
    (await prisma.platformWallet.findUnique({ where: { userId } }))!.availableBalance,
  );
  const newBalance = Math.round((current + amount) * 100) / 100;
  await prisma.$transaction([
    prisma.platformWallet.update({
      where: { userId },
      data: { availableBalance: newBalance },
    }),
    prisma.walletTransaction.create({
      data: {
        userId,
        amount,
        type: 'ADJUSTMENT',
        description,
        referenceId,
        balanceAfter: newBalance,
      },
    }),
  ]);
  return newBalance;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { id: USER_ID } });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }
  if (user.investorActive) throw new Error('Already enrolled — aborting');

  const name = user.displayName?.trim() || 'there';
  const now = new Date();

  await prisma.user.update({
    where: { id: USER_ID },
    data: {
      status: 'ACTIVE',
      registrationPaid: true,
      instantWithdraw: true,
      instantWithdrawGrantedAt: now,
      instantWithdrawGrantedById: ADMIN_ID,
    },
  });

  const balanceAfterDeposit = await creditWallet(
    USER_ID,
    DEPOSIT_USDT,
    `Admin deposit — $${DEPOSIT_USDT.toFixed(2)} USDT`,
    `admin_${ADMIN_ID}_deposit`,
  );
  await sendEmail(
    user.email,
    `Admin deposited $${DEPOSIT_USDT.toFixed(2)} USDT to your wallet`,
    layout(
      'Admin deposit received',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>An administrator deposited <strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong> into your platform wallet.</p>
      <p>Available balance: <strong>$${balanceAfterDeposit.toFixed(2)} USDT</strong></p>
      ${button(`${frontendUrl}/wallet`, 'View wallet')}`,
    ),
    `Admin deposited $${DEPOSIT_USDT.toFixed(2)} USDT. Balance: $${balanceAfterDeposit.toFixed(2)} USDT.`,
  );
  console.log('deposit email sent');

  await sendEmail(
    user.email,
    'Instant yield enabled — no 24-hour hold',
    layout(
      'Your account: immediate Smart Invest yield',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>Your account is configured for <strong>immediate daily yield</strong> on Smart Invest — there is <strong>no 24-hour waiting period</strong> on new allocations.</p>
      <p>New capital starts earning on the next daily credit cycle (weekdays, Kampala time).</p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `Instant yield enabled on your account — no 24-hour hold on Smart Invest allocations. Open ${frontendUrl}/invest`,
  );
  console.log('instant-yield email sent');

  const enrollPayment = await prisma.payment.create({
    data: {
      userId: USER_ID,
      amount: INVEST_USDT,
      currency: 'USDT',
      network: 'WALLET',
      purpose: 'investor_enrollment',
      status: 'CONFIRMED',
      confirmedAt: now,
      gatewayId: `wallet_admin_${Date.now()}`,
      gatewayResponse: {
        paymentSource: 'wallet',
        investmentAmount: INVEST_USDT,
        feeUsdt: 0,
        netInvested: INVEST_USDT,
        feeWaived: true,
        adminId: ADMIN_ID,
      } as object,
    },
  });

  const walletRow = await prisma.platformWallet.findUnique({ where: { userId: USER_ID } });
  const available = Number(walletRow?.availableBalance ?? 0);
  const invested = Number(walletRow?.investorBalance ?? 0);
  if (available < INVEST_USDT) {
    throw new Error(`Need $${INVEST_USDT} to invest, have $${available}`);
  }
  const nextAvailable = Math.round((available - INVEST_USDT) * 100) / 100;
  const nextInvested = Math.round((invested + INVEST_USDT) * 100) / 100;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: USER_ID },
      data: { investorActive: true, investorEnrolledAt: now },
    }),
    prisma.investorSettings.upsert({
      where: { userId: USER_ID },
      create: {
        userId: USER_ID,
        riskPercent: 2,
        committedInvestmentAmount: INVEST_USDT,
      },
      update: { committedInvestmentAmount: INVEST_USDT },
    }),
    prisma.platformWallet.update({
      where: { userId: USER_ID },
      data: {
        availableBalance: nextAvailable,
        investorBalance: nextInvested,
      },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -INVEST_USDT,
        type: 'INVESTOR_ALLOCATE',
        referenceId: enrollPayment.id,
        description: `Admin enrollment — $${INVEST_USDT.toFixed(2)} USDT invested (fee waived, immediate yield)`,
        balanceAfter: nextAvailable,
      },
    }),
  ]);

  await sendEmail(
    user.email,
    `Smart Invest activated — $${INVEST_USDT.toFixed(2)} USDT invested`,
    layout(
      'Smart Invest is active',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>Your <strong>Smart Invest</strong> account is now active.</p>
      <p>Amount invested: <strong>$${INVEST_USDT.toFixed(2)} USDT</strong></p>
      <p>Enrollment fee: <strong>waived</strong></p>
      <p>Investment balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></p>
      <p style="color:#94a3b8;font-size:14px;">Daily yield credits on weekdays (Kampala schedule). Your allocation earns immediately — no 24-hour hold.</p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `Smart Invest activated. $${INVEST_USDT.toFixed(2)} USDT invested (fee waived). Open ${frontendUrl}/invest`,
  );
  console.log('investment email sent');

  const final = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true },
  });

  console.log(
    JSON.stringify(
      {
        email: final?.email,
        displayName: final?.displayName,
        status: final?.status,
        investorActive: final?.investorActive,
        instantWithdraw: final?.instantWithdraw,
        walletBalance: Number(final?.platformWallet?.availableBalance ?? 0),
        investmentBalance: Number(final?.platformWallet?.investorBalance ?? 0),
        emailsSent: ['deposit', 'instant-yield', 'investment'],
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
