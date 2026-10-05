/**
 * One-off: enroll nelysa2020 in Smart Invest — $100 wallet → $20 fee (20%) → $80 invested.
 * 24h yield hold waived via backdated INVESTOR_ALLOCATE tx.
 *
 * Usage: cd backend && npx tsx scripts/credit-nelysa2020-smart-invest.ts
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

const USER_ID = 'cmsqkmvv51fhtm2017m30on2u';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'nelysa2020@gmail.com';

const DEPOSIT_USDT = 100;
const FEE_PERCENT = 20;
const FEE_USDT = Math.round(((DEPOSIT_USDT * FEE_PERCENT) / 100) * 100) / 100;
const NET_INVESTED = Math.round((DEPOSIT_USDT - FEE_USDT) * 100) / 100;

const REFERENCE_PREFIX = 'nelysa2020_admin_smart_invest_2026-08-31';
const FEE_REF = `${REFERENCE_PREFIX}_fee`;
const ENROLL_REF = `${REFERENCE_PREFIX}_enroll`;
const ALLOCATE_REF = `${REFERENCE_PREFIX}_allocate`;

const HOLD_BACKDATE_MS = 25 * 60 * 60 * 1000;

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

async function main() {
  const existing = await prisma.walletTransaction.findFirst({
    where: { referenceId: ALLOCATE_REF },
  });
  if (existing) {
    const user = await prisma.user.findUnique({
      where: { id: USER_ID },
      include: { platformWallet: true },
    });
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'already_processed',
          email: user?.email,
          investmentBalance: Number(user?.platformWallet?.investorBalance ?? 0),
        },
        null,
        2,
      ),
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }
  if (user.investorActive) {
    throw new Error('User already enrolled — use transfer script instead');
  }

  const available = Number(user.platformWallet?.availableBalance ?? 0);
  if (available < DEPOSIT_USDT) {
    throw new Error(`Need $${DEPOSIT_USDT} in wallet, have $${available.toFixed(2)}`);
  }

  const name = user.displayName?.trim() || 'there';
  const now = new Date();
  const backdatedAt = new Date(Date.now() - HOLD_BACKDATE_MS);

  const before = {
    walletBalance: available,
    investmentBalance: Number(user.platformWallet?.investorBalance ?? 0),
    investorActive: user.investorActive,
  };

  const payment = await prisma.payment.create({
    data: {
      userId: USER_ID,
      amount: DEPOSIT_USDT,
      currency: 'USDT',
      network: 'WALLET',
      purpose: 'investor_enrollment',
      status: 'CONFIRMED',
      confirmedAt: now,
      gatewayId: ENROLL_REF,
      gatewayResponse: {
        paymentSource: 'wallet',
        investmentAmount: DEPOSIT_USDT,
        feeUsdt: FEE_USDT,
        feePercent: FEE_PERCENT,
        netInvested: NET_INVESTED,
        adminId: ADMIN_ID,
        holdWaived: true,
      } as object,
    },
  });

  const wallet = await prisma.platformWallet.findUnique({ where: { userId: USER_ID } });
  let balanceAfterFee =
    Math.round((Number(wallet!.availableBalance) - FEE_USDT) * 100) / 100;

  await prisma.$transaction(async (tx) => {
    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: balanceAfterFee },
    });
    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -FEE_USDT,
        type: 'INVESTOR_FEE',
        referenceId: FEE_REF,
        description: `Smart Invest enrollment fee — $${FEE_USDT.toFixed(2)} USDT (${FEE_PERCENT}% of $${DEPOSIT_USDT.toFixed(2)})`,
        balanceAfter: balanceAfterFee,
      },
    });
  });

  balanceAfterFee = Math.round((balanceAfterFee - NET_INVESTED) * 100) / 100;
  const nextInvested =
    Math.round((before.investmentBalance + NET_INVESTED) * 100) / 100;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: USER_ID },
      data: { investorActive: true, investorEnrolledAt: now },
    });
    await tx.investorSettings.upsert({
      where: { userId: USER_ID },
      create: {
        userId: USER_ID,
        riskPercent: 2,
        committedInvestmentAmount: NET_INVESTED,
      },
      update: { committedInvestmentAmount: NET_INVESTED },
    });
    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: {
        availableBalance: balanceAfterFee,
        investorBalance: nextInvested,
      },
    });
    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -NET_INVESTED,
        type: 'INVESTOR_ALLOCATE',
        referenceId: ALLOCATE_REF,
        description: `Admin enrollment — $${NET_INVESTED.toFixed(2)} USDT invested (${FEE_PERCENT}% fee $${FEE_USDT.toFixed(2)} on $${DEPOSIT_USDT.toFixed(2)}; 24h hold waived)`,
        balanceAfter: balanceAfterFee,
        createdAt: backdatedAt,
      },
    });
    await tx.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_TRANSFER',
        targetId: USER_ID,
        metadata: {
          source: 'credit-nelysa2020-smart-invest',
          paymentId: payment.id,
          deposit: DEPOSIT_USDT,
          feeAmount: FEE_USDT,
          feePercent: FEE_PERCENT,
          netInvested: NET_INVESTED,
          direction: 'to_investment',
          holdWaived: true,
          holdWaiveMethod: 'backdated_allocate_tx',
        },
      },
    });
  });

  const emailSent = await sendEmail(
    user.email,
    `Smart Invest activated — $${NET_INVESTED.toFixed(2)} USDT invested`,
    layout(
      'You have been enrolled in Smart Invest',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>Your platform wallet balance of <strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong> has been allocated to <strong>Smart Invest</strong>.</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Enrollment fee (${FEE_PERCENT}%): <strong>$${FEE_USDT.toFixed(2)} USDT</strong></li>
        <li>Amount invested: <strong>$${NET_INVESTED.toFixed(2)} USDT</strong></li>
        <li>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></li>
        <li>Platform wallet: <strong>$${balanceAfterFee.toFixed(2)} USDT</strong></li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">Your investment is eligible for daily yield immediately — the 24-hour hold has been waived. Credits run on weekdays (Kampala time).</p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `Smart Invest activated. $${DEPOSIT_USDT.toFixed(2)} USDT from wallet with ${FEE_PERCENT}% fee ($${FEE_USDT.toFixed(2)}). $${NET_INVESTED.toFixed(2)} USDT invested. 24h hold waived.`,
  );

  const afterUser = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true },
  });

  console.log(
    JSON.stringify(
      {
        user: {
          id: USER_ID,
          email: user.email,
          displayName: user.displayName,
        },
        before,
        after: {
          investorActive: afterUser?.investorActive,
          walletBalance: Number(afterUser?.platformWallet?.availableBalance ?? 0),
          investmentBalance: Number(afterUser?.platformWallet?.investorBalance ?? 0),
        },
        depositUsdt: DEPOSIT_USDT,
        feePercent: FEE_PERCENT,
        feeUsdt: FEE_USDT,
        netInvested: NET_INVESTED,
        holdStatus: '24h hold waived (backdated INVESTOR_ALLOCATE tx by 25h)',
        emailSent,
        paymentId: payment.id,
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
