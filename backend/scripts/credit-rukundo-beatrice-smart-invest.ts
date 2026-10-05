/**
 * One-off: admin deposit + Smart Invest allocation for Rukundo and Beatrice.
 *
 * Rukundo (erukundo181@gmail.com): $1,448 deposit, 10% daily yield, instant yield (whitelist).
 * Beatrice (dngororanod@gmail.com): $750 deposit, 24h hold waived on this allocation only.
 *
 * Usage: cd backend && npx tsx scripts/credit-rukundo-beatrice-smart-invest.ts
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
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const apiKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';

const HOLD_BACKDATE_MS = 25 * 60 * 60 * 1000;

const RUKUNDO = {
  userId: 'cmrp7725801gyfa01xic0w320',
  email: 'erukundo181@gmail.com',
  depositUsdt: 1448,
  dailyYieldPercent: 10,
  instantYield: true,
  depositRef: 'rukundo_admin_deposit_2026-08-31',
  allocateRef: 'rukundo_admin_allocate_2026-08-31',
};

const BEATRICE = {
  userId: 'cmsg56vj607fwku0137qv270f',
  email: 'dngororanod@gmail.com',
  depositUsdt: 750,
  depositRef: 'beatrice_admin_deposit_2026-08-31',
  allocateRef: 'beatrice_admin_allocate_2026-08-31',
};

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

type BeforeSnapshot = {
  walletBalance: number;
  investmentBalance: number;
  instantWithdraw: boolean;
  dailyYieldPercent: number | null;
};

async function snapshotUser(userId: string): Promise<BeforeSnapshot> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!user) throw new Error(`User ${userId} not found`);
  return {
    walletBalance: Number(user.platformWallet?.availableBalance ?? 0),
    investmentBalance: Number(user.platformWallet?.investorBalance ?? 0),
    instantWithdraw: user.instantWithdraw,
    dailyYieldPercent:
      user.investorSettings?.dailyYieldPercent != null
        ? Number(user.investorSettings.dailyYieldPercent)
        : null,
  };
}

async function creditWallet(
  userId: string,
  amount: number,
  referenceId: string,
  description: string,
) {
  await prisma.platformWallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const wallet = await prisma.platformWallet.findUnique({ where: { userId } });
  const newBalance =
    Math.round((Number(wallet!.availableBalance) + amount) * 100) / 100;
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
        referenceId,
        description,
        balanceAfter: newBalance,
      },
    }),
  ]);
  return newBalance;
}

async function allocateToInvest(
  userId: string,
  amount: number,
  referenceId: string,
  description: string,
  backdateHoldWaive: boolean,
) {
  const wallet = await prisma.platformWallet.findUnique({ where: { userId } });
  const available = Number(wallet?.availableBalance ?? 0);
  const invested = Number(wallet?.investorBalance ?? 0);
  if (available < amount) {
    throw new Error(`Need $${amount} to allocate, have $${available}`);
  }
  const nextAvailable = Math.round((available - amount) * 100) / 100;
  const nextInvested = Math.round((invested + amount) * 100) / 100;
  const backdatedAt = new Date(Date.now() - HOLD_BACKDATE_MS);

  const allocateTx = await prisma.$transaction(async (tx) => {
    await tx.platformWallet.update({
      where: { userId },
      data: {
        availableBalance: nextAvailable,
        investorBalance: nextInvested,
      },
    });
    const txRow = await tx.walletTransaction.create({
      data: {
        userId,
        amount: -amount,
        type: 'INVESTOR_ALLOCATE',
        referenceId,
        description,
        balanceAfter: nextAvailable,
        ...(backdateHoldWaive ? { createdAt: backdatedAt } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_TRANSFER',
        targetId: userId,
        metadata: {
          amount,
          direction: 'to_investment',
          feeAmount: 0,
          feePercent: 0,
          netInvested: amount,
          holdWaived: backdateHoldWaive,
          holdWaiveMethod: backdateHoldWaive ? 'backdated_allocate_tx' : null,
        },
      },
    });
    return txRow;
  });

  return {
    nextAvailable,
    nextInvested,
    allocateTxId: allocateTx.id,
    holdWaivedViaBackdate: backdateHoldWaive,
  };
}

async function processRukundo() {
  const cfg = RUKUNDO;
  const user = await prisma.user.findUnique({ where: { id: cfg.userId } });
  if (!user?.email) throw new Error('Rukundo not found');
  if (user.email.toLowerCase() !== cfg.email) {
    throw new Error(`Rukundo email mismatch: ${user.email}`);
  }
  if (!user.investorActive) {
    throw new Error('Rukundo is not enrolled in Smart Invest');
  }

  const before = await snapshotUser(cfg.userId);
  const existingDeposit = await prisma.walletTransaction.findFirst({
    where: { referenceId: cfg.depositRef },
  });
  if (existingDeposit) {
    const after = await snapshotUser(cfg.userId);
    return {
      skipped: true,
      reason: 'already_processed',
      email: cfg.email,
      before,
      after,
    };
  }

  const now = new Date();
  const name = user.displayName?.trim() || 'there';

  await prisma.user.update({
    where: { id: cfg.userId },
    data: {
      instantWithdraw: true,
      instantWithdrawGrantedAt: user.instantWithdrawGrantedAt ?? now,
      instantWithdrawGrantedById: user.instantWithdrawGrantedById ?? ADMIN_ID,
    },
  });

  await prisma.investorSettings.upsert({
    where: { userId: cfg.userId },
    create: {
      userId: cfg.userId,
      riskPercent: 2,
      dailyYieldPercent: cfg.dailyYieldPercent,
    },
    update: { dailyYieldPercent: cfg.dailyYieldPercent },
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'INSTANT_WITHDRAW_WHITELIST',
      targetId: cfg.userId,
      metadata: {
        enabled: true,
        instantYield: true,
        note: 'No 24h yield hold on Smart Invest allocations',
        source: 'credit-rukundo-beatrice-smart-invest',
      },
    },
  });

  const balanceAfterDeposit = await creditWallet(
    cfg.userId,
    cfg.depositUsdt,
    cfg.depositRef,
    `Admin deposit — $${cfg.depositUsdt.toFixed(2)} USDT`,
  );

  const { nextAvailable, nextInvested } = await allocateToInvest(
    cfg.userId,
    cfg.depositUsdt,
    cfg.allocateRef,
    `Admin allocation — $${cfg.depositUsdt.toFixed(2)} USDT to Smart Invest (immediate yield, ${cfg.dailyYieldPercent}% daily)`,
    false,
  );

  const emailsSent: string[] = [];

  await sendEmail(
    user.email,
    `Admin deposited $${cfg.depositUsdt.toFixed(2)} USDT — allocated to Smart Invest`,
    layout(
      'Admin deposit & Smart Invest allocation',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>An administrator deposited <strong>$${cfg.depositUsdt.toFixed(2)} USDT</strong> into your platform wallet and allocated it to <strong>Smart Invest</strong>.</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></li>
        <li>Platform wallet: <strong>$${nextAvailable.toFixed(2)} USDT</strong></li>
        <li>Daily yield rate: <strong>${cfg.dailyYieldPercent}%</strong></li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">Your account earns daily yield immediately on new allocations — no 24-hour hold. Credits run on weekdays (Kampala time).</p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `Admin deposited $${cfg.depositUsdt.toFixed(2)} USDT and allocated to Smart Invest. Balance: $${nextInvested.toFixed(2)} USDT invested at ${cfg.dailyYieldPercent}% daily yield. Immediate yield — no 24h hold.`,
  );
  emailsSent.push('deposit-and-allocation');

  const after = await snapshotUser(cfg.userId);
  return {
    skipped: false,
    email: cfg.email,
    displayName: user.displayName,
    depositUsdt: cfg.depositUsdt,
    before,
    after,
    balanceAfterDeposit,
    holdStatus: 'instant_yield_whitelist (no 24h hold on new allocations)',
    dailyYieldPercent: cfg.dailyYieldPercent,
    emailsSent,
  };
}

async function processBeatrice() {
  const cfg = BEATRICE;
  const user = await prisma.user.findUnique({ where: { id: cfg.userId } });
  if (!user?.email) throw new Error('Beatrice not found');
  if (user.email.toLowerCase() !== cfg.email) {
    throw new Error(`Beatrice email mismatch: ${user.email}`);
  }
  if (!user.investorActive) {
    throw new Error('Beatrice is not enrolled in Smart Invest');
  }

  const before = await snapshotUser(cfg.userId);
  const existingDeposit = await prisma.walletTransaction.findFirst({
    where: { referenceId: cfg.depositRef },
  });
  if (existingDeposit) {
    const after = await snapshotUser(cfg.userId);
    return {
      skipped: true,
      reason: 'already_processed',
      email: cfg.email,
      before,
      after,
    };
  }

  const name = user.displayName?.trim() || 'there';

  const balanceAfterDeposit = await creditWallet(
    cfg.userId,
    cfg.depositUsdt,
    cfg.depositRef,
    `Admin deposit — $${cfg.depositUsdt.toFixed(2)} USDT`,
  );

  const { nextAvailable, nextInvested, allocateTxId } = await allocateToInvest(
    cfg.userId,
    cfg.depositUsdt,
    cfg.allocateRef,
    `Admin allocation — $${cfg.depositUsdt.toFixed(2)} USDT to Smart Invest (24h hold waived on this deposit)`,
    true,
  );

  const emailsSent: string[] = [];

  await sendEmail(
    user.email,
    `Admin deposited $${cfg.depositUsdt.toFixed(2)} USDT — allocated to Smart Invest`,
    layout(
      'Admin deposit & Smart Invest allocation',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>An administrator deposited <strong>$${cfg.depositUsdt.toFixed(2)} USDT</strong> into your platform wallet and allocated it to <strong>Smart Invest</strong>.</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></li>
        <li>Platform wallet: <strong>$${nextAvailable.toFixed(2)} USDT</strong></li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">This allocation is eligible for daily yield immediately — the 24-hour hold has been waived for this deposit only. Credits run on weekdays (Kampala time).</p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `Admin deposited $${cfg.depositUsdt.toFixed(2)} USDT and allocated to Smart Invest. Balance: $${nextInvested.toFixed(2)} USDT. 24h hold waived on this deposit.`,
  );
  emailsSent.push('deposit-and-allocation');

  const after = await snapshotUser(cfg.userId);
  return {
    skipped: false,
    email: cfg.email,
    displayName: user.displayName,
    depositUsdt: cfg.depositUsdt,
    before,
    after,
    balanceAfterDeposit,
    holdStatus: '24h hold waived on this allocation only (backdated allocate tx)',
    allocateTxId,
    emailsSent,
  };
}

async function main() {
  const rukundo = await processRukundo();
  console.log('RUKUNDO:', JSON.stringify(rukundo, null, 2));

  const beatrice = await processBeatrice();
  console.log('BEATRICE:', JSON.stringify(beatrice, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
