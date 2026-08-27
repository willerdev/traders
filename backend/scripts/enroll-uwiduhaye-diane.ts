/**
 * One-off: credit, commission, VIP, Smart Invest enrollment for Uwiduhaye Diane.
 * Usage: cd backend && npx tsx scripts/enroll-uwiduhaye-diane.ts
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

const USER_ID = 'cms991i7m01zlfa0186vwzgli';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'uwiduhaye3@gmail.com';

const DEPOSIT_USDT = 1297;
const COMMISSION_USDT = 100;
const VIP_USDT = 20;
const INVEST_USDT = DEPOSIT_USDT - COMMISSION_USDT - VIP_USDT;
const VIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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

async function creditWallet(userId: string, amount: number, type: string, description: string, referenceId: string) {
  const wallet = await prisma.platformWallet.findUnique({ where: { userId } });
  if (!wallet) {
    await prisma.platformWallet.create({ data: { userId } });
  }
  const current = Number((await prisma.platformWallet.findUnique({ where: { userId } }))!.availableBalance);
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
        type: type as never,
        description,
        referenceId,
        balanceAfter: newBalance,
      },
    }),
  ]);
  return newBalance;
}

async function debitWallet(userId: string, amount: number, type: string, description: string, referenceId: string) {
  const wallet = await prisma.platformWallet.findUnique({ where: { userId } });
  const current = Number(wallet?.availableBalance ?? 0);
  if (current < amount) throw new Error(`Insufficient balance: have ${current}, need ${amount}`);
  const newBalance = Math.round((current - amount) * 100) / 100;
  await prisma.$transaction([
    prisma.platformWallet.update({
      where: { userId },
      data: { availableBalance: newBalance },
    }),
    prisma.walletTransaction.create({
      data: {
        userId,
        amount: -amount,
        type: type as never,
        description,
        referenceId,
        balanceAfter: newBalance,
      },
    }),
  ]);
  return newBalance;
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }
  if (user.investorActive) throw new Error('Already enrolled — aborting');

  const name = user.displayName?.trim() || 'there';
  const now = new Date();
  const vipExpiresAt = new Date(now.getTime() + VIP_DURATION_MS);

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
    'ADJUSTMENT',
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
      <p style="color:#94a3b8;font-size:14px;">Your account is set up for immediate yield on new Smart Invest allocations — no 24-hour hold.</p>
      ${button(`${frontendUrl}/wallet`, 'View wallet')}`,
    ),
    `Admin deposited $${DEPOSIT_USDT.toFixed(2)} USDT. Balance: $${balanceAfterDeposit.toFixed(2)} USDT.`,
  );
  console.log('deposit email sent');

  const balanceAfterCommission = await debitWallet(
    USER_ID,
    COMMISSION_USDT,
    'INVESTOR_FEE',
    `Smart Invest commission — $${COMMISSION_USDT.toFixed(2)} USDT`,
    `admin_${ADMIN_ID}_commission`,
  );
  await sendEmail(
    user.email,
    `Commission applied — $${COMMISSION_USDT.toFixed(2)} USDT`,
    layout(
      'Smart Invest commission',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>A <strong>$${COMMISSION_USDT.toFixed(2)} USDT</strong> commission was deducted from your wallet for Smart Invest activation.</p>
      <p>Available balance: <strong>$${balanceAfterCommission.toFixed(2)} USDT</strong></p>
      ${button(`${frontendUrl}/wallet`, 'View wallet')}`,
    ),
    `Smart Invest commission $${COMMISSION_USDT.toFixed(2)} USDT deducted. Balance: $${balanceAfterCommission.toFixed(2)} USDT.`,
  );
  console.log('commission email sent');

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
        description: `Admin enrollment — $${INVEST_USDT.toFixed(2)} USDT invested (all fees waived, immediate yield)`,
        balanceAfter: nextAvailable,
      },
    }),
  ]);

  await sendEmail(
    user.email,
    'You have been enrolled in Smart Invest',
    layout(
      'You have been enrolled as an investor',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>An administrator activated your <strong>Smart Invest</strong> account.</p>
      <p>Investment amount: <strong>$${INVEST_USDT.toFixed(2)} USDT</strong></p>
      <p>Enrollment fee: <strong>waived</strong></p>
      <p>Amount invested: <strong>$${INVEST_USDT.toFixed(2)} USDT</strong></p>
      <p style="color:#94a3b8;font-size:14px;">Your capital earns daily yield immediately — no 24-hour hold on this allocation.</p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `Smart Invest activated. $${INVEST_USDT.toFixed(2)} USDT invested (fee waived). Open ${frontendUrl}/invest`,
  );
  console.log('investment email sent');

  const vipPayment = await prisma.payment.create({
    data: {
      userId: USER_ID,
      amount: VIP_USDT,
      currency: 'USDT',
      network: 'WALLET',
      purpose: 'investor_vip',
      status: 'CONFIRMED',
      confirmedAt: now,
      gatewayId: `vip_wallet_admin_${Date.now()}`,
      gatewayResponse: {
        paymentSource: 'wallet',
        feeWaived: false,
        expiresAt: vipExpiresAt.toISOString(),
        months: 1,
        adminId: ADMIN_ID,
      } as object,
    },
  });

  const balanceAfterVip = await debitWallet(
    USER_ID,
    VIP_USDT,
    'SUBSCRIPTION',
    `Investor VIP — $${VIP_USDT.toFixed(2)} USDT / 30 days`,
    vipPayment.id,
  );

  await prisma.user.update({
    where: { id: USER_ID },
    data: {
      investorVipActive: true,
      investorVipExpiresAt: vipExpiresAt,
      investorVipRemindedAt: null,
    },
  });

  await sendEmail(
    user.email,
    `VIP activated — expires ${vipExpiresAt.toISOString().slice(0, 10)}`,
    layout(
      'VIP investor activated',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>Your <strong>VIP</strong> investor badge is active.</p>
      <p>You paid <strong>$${VIP_USDT.toFixed(2)} USDT</strong> for 30 days (expires <strong>${vipExpiresAt.toISOString().slice(0, 10)}</strong>).</p>
      <ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.7;">
        <li>10% daily yield on Smart Invest</li>
        <li>$0 wallet withdrawal fee</li>
      </ul>
      <p>Available wallet balance: <strong>$${balanceAfterVip.toFixed(2)} USDT</strong></p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `VIP activated until ${vipExpiresAt.toISOString().slice(0, 10)}. Fee $${VIP_USDT.toFixed(2)} USDT.`,
  );
  console.log('vip email sent');

  const final = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true },
  });

  console.log(
    JSON.stringify(
      {
        email: final?.email,
        status: final?.status,
        investorActive: final?.investorActive,
        investorVipActive: final?.investorVipActive,
        investorVipExpiresAt: final?.investorVipExpiresAt?.toISOString(),
        instantWithdraw: final?.instantWithdraw,
        walletBalance: Number(final?.platformWallet?.availableBalance ?? 0),
        investmentBalance: Number(final?.platformWallet?.investorBalance ?? 0),
        breakdown: {
          deposit: DEPOSIT_USDT,
          commission: COMMISSION_USDT,
          invested: INVEST_USDT,
          vip: VIP_USDT,
        },
        emailsSent: ['deposit', 'commission', 'investment', 'vip'],
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
