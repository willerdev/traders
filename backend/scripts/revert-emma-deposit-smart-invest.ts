/**
 * Revert admin one-off for EMMA (etuyizere64@gmail.com):
 * - De-allocate $1,000 from Smart Invest (INVESTOR_REDEEM)
 * - Refund $100 investment fee (ADJUSTMENT)
 * - Remove $1,100 admin deposit (ADJUSTMENT debit)
 *
 * Restores: Wallet $12,150, Smart Invest $2,000
 * Idempotent: skips if revert reference already exists.
 *
 * Usage: cd backend && npx tsx scripts/revert-emma-deposit-smart-invest.ts
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

const USER_ID = 'cms7wxc4g08u2ke01n7ineqld';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'etuyizere64@gmail.com';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';

const DEPOSIT_USDT = 1100;
const FEE_USDT = 100;
const NET_INVESTED = DEPOSIT_USDT - FEE_USDT;

const EXPECTED_WALLET = 12150;
const EXPECTED_INVEST = 2000;

const ORIGINAL_PREFIX = 'emma_admin_deposit_smart_invest_2026-09-07';
const ORIGINAL_DEPOSIT_REF = `${ORIGINAL_PREFIX}_deposit`;
const ORIGINAL_FEE_REF = `${ORIGINAL_PREFIX}_fee`;
const ORIGINAL_ALLOCATE_REF = `${ORIGINAL_PREFIX}_allocate`;

const REVERT_PREFIX = `${ORIGINAL_PREFIX}_revert`;
const REVERT_REDEEM_REF = `${REVERT_PREFIX}_redeem`;
const REVERT_FEE_REF = `${REVERT_PREFIX}_fee`;
const REVERT_DEPOSIT_REF = `${REVERT_PREFIX}_deposit`;

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
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }

  const before = {
    walletBalance: Number(user.platformWallet?.availableBalance ?? 0),
    investmentBalance: Number(user.platformWallet?.investorBalance ?? 0),
  };

  const existingRevert = await prisma.walletTransaction.findFirst({
    where: { referenceId: REVERT_REDEEM_REF },
  });
  if (existingRevert) {
    const fresh = await prisma.user.findUnique({
      where: { id: USER_ID },
      include: { platformWallet: true },
    });
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'already_reverted',
          user: { id: USER_ID, email: EMAIL },
          before,
          after: {
            walletBalance: Number(fresh?.platformWallet?.availableBalance ?? 0),
            investmentBalance: Number(fresh?.platformWallet?.investorBalance ?? 0),
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const [depositTx, feeTx, allocateTx] = await Promise.all([
    prisma.walletTransaction.findFirst({
      where: { userId: USER_ID, referenceId: ORIGINAL_DEPOSIT_REF },
    }),
    prisma.walletTransaction.findFirst({
      where: { userId: USER_ID, referenceId: ORIGINAL_FEE_REF },
    }),
    prisma.walletTransaction.findFirst({
      where: { userId: USER_ID, referenceId: ORIGINAL_ALLOCATE_REF },
    }),
  ]);

  if (!depositTx || !feeTx || !allocateTx) {
    throw new Error(
      'Original admin deposit transactions not found — verify before reverting',
    );
  }
  if (Number(depositTx.amount) !== DEPOSIT_USDT) {
    throw new Error(`Expected deposit $${DEPOSIT_USDT}, found $${depositTx.amount}`);
  }
  if (Math.abs(Number(feeTx.amount)) !== FEE_USDT) {
    throw new Error(`Expected fee $${FEE_USDT}, found $${Math.abs(Number(feeTx.amount))}`);
  }
  if (Math.abs(Number(allocateTx.amount)) !== NET_INVESTED) {
    throw new Error(
      `Expected allocate $${NET_INVESTED}, found $${Math.abs(Number(allocateTx.amount))}`,
    );
  }

  const allocateAt = allocateTx.createdAt;
  const yieldSinceAllocate = await prisma.walletTransaction.findMany({
    where: {
      userId: USER_ID,
      type: 'INVESTOR_EARNING',
      createdAt: { gte: allocateAt },
    },
    orderBy: { createdAt: 'asc' },
  });
  const yieldTotal = yieldSinceAllocate.reduce(
    (sum, tx) => sum + Number(tx.amount),
    0,
  );
  const yieldWarning =
    yieldSinceAllocate.length > 0
      ? {
          count: yieldSinceAllocate.length,
          totalUsdt: Math.round(yieldTotal * 100) / 100,
          note: 'Yield was credited on the reverted allocation — balances may differ from pre-deposit state unless yield is also reversed separately.',
        }
      : null;

  const wallet =
    user.platformWallet ??
    (await prisma.platformWallet.create({ data: { userId: USER_ID } }));
  let available = Number(wallet.availableBalance);
  let invested = Number(wallet.investorBalance ?? 0);

  if (invested < NET_INVESTED) {
    throw new Error(
      `Insufficient Smart Invest balance — need $${NET_INVESTED.toFixed(2)} but have $${invested.toFixed(2)}`,
    );
  }

  const name = user.displayName?.trim() || 'EMMA';

  await prisma.$transaction(async (tx) => {
    available = Math.round((available + NET_INVESTED) * 100) / 100;
    invested = Math.round((invested - NET_INVESTED) * 100) / 100;

    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: {
        availableBalance: available,
        investorBalance: invested,
      },
    });
    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: NET_INVESTED,
        type: 'INVESTOR_REDEEM',
        referenceId: REVERT_REDEEM_REF,
        description: `Admin reversal — $${NET_INVESTED.toFixed(2)} USDT de-allocated from Smart Invest (reverts ${ORIGINAL_ALLOCATE_REF})`,
        balanceAfter: available,
      },
    });

    available = Math.round((available + FEE_USDT) * 100) / 100;
    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: available },
    });
    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: FEE_USDT,
        type: 'ADJUSTMENT',
        referenceId: REVERT_FEE_REF,
        description: `Admin reversal — $${FEE_USDT.toFixed(2)} USDT investment fee refund (reverts ${ORIGINAL_FEE_REF})`,
        balanceAfter: available,
      },
    });

    available = Math.round((available - DEPOSIT_USDT) * 100) / 100;
    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: available },
    });
    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -DEPOSIT_USDT,
        type: 'ADJUSTMENT',
        referenceId: REVERT_DEPOSIT_REF,
        description: `Admin reversal — remove $${DEPOSIT_USDT.toFixed(2)} USDT admin deposit (reverts ${ORIGINAL_DEPOSIT_REF})`,
        balanceAfter: available,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_TRANSFER',
        targetId: USER_ID,
        metadata: {
          source: 'revert-emma-deposit-smart-invest',
          email: EMAIL,
          revertedDeposit: DEPOSIT_USDT,
          revertedFee: FEE_USDT,
          revertedAllocate: NET_INVESTED,
          direction: 'reversal_to_pre_deposit',
          originalRefs: {
            deposit: ORIGINAL_DEPOSIT_REF,
            fee: ORIGINAL_FEE_REF,
            allocate: ORIGINAL_ALLOCATE_REF,
          },
          yieldWarning,
        },
      },
    });
  });

  const afterUser = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true },
  });
  const after = {
    walletBalance: Number(afterUser?.platformWallet?.availableBalance ?? 0),
    investmentBalance: Number(afterUser?.platformWallet?.investorBalance ?? 0),
  };

  const balanceMatch =
    after.walletBalance === EXPECTED_WALLET &&
    after.investmentBalance === EXPECTED_INVEST;

  const userSubject = `Admin deposit reversed — Smart Invest restored to $${after.investmentBalance.toFixed(2)} USDT`;
  const userHtml = layout(
    'Admin deposit reversed',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>An administrator has reversed the recent admin deposit on your account. Here is what changed:</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>Smart Invest de-allocation: <strong>$${NET_INVESTED.toFixed(2)} USDT</strong></li>
      <li>Investment fee refunded: <strong>$${FEE_USDT.toFixed(2)} USDT</strong></li>
      <li>Admin deposit removed: <strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong></li>
      <li>Platform wallet: <strong>$${after.walletBalance.toFixed(2)} USDT</strong></li>
      <li>Smart Invest balance: <strong>$${after.investmentBalance.toFixed(2)} USDT</strong></li>
    </ul>
    <p style="color:#94a3b8;font-size:14px;">Your account balances are restored to their state before the admin deposit was applied.</p>
    ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
  );
  const userText = `Admin deposit reversed. $${NET_INVESTED.toFixed(2)} de-allocated, $${FEE_USDT.toFixed(2)} fee refunded, $${DEPOSIT_USDT.toFixed(2)} deposit removed. Wallet: $${after.walletBalance.toFixed(2)} USDT. Smart Invest: $${after.investmentBalance.toFixed(2)} USDT.`;

  const userEmailSent = await sendEmail(EMAIL, userSubject, userHtml, userText);

  const adminSubject = `[Admin] EMMA deposit reversed — wallet $${after.walletBalance}, Smart Invest $${after.investmentBalance}`;
  const adminHtml = layout(
    'EMMA admin deposit reversal complete',
    `<p>Reversal completed for <strong>${escapeHtml(EMAIL)}</strong>.</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>User: ${escapeHtml(name)} (${escapeHtml(EMAIL)})</li>
      <li>De-allocated: <strong>$${NET_INVESTED.toFixed(2)} USDT</strong></li>
      <li>Fee refunded: <strong>$${FEE_USDT.toFixed(2)} USDT</strong></li>
      <li>Deposit removed: <strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong></li>
      <li>Before — wallet: $${before.walletBalance.toFixed(2)}, Smart Invest: $${before.investmentBalance.toFixed(2)}</li>
      <li>After — wallet: $${after.walletBalance.toFixed(2)}, Smart Invest: $${after.investmentBalance.toFixed(2)}</li>
      <li>Expected — wallet: $${EXPECTED_WALLET.toFixed(2)}, Smart Invest: $${EXPECTED_INVEST.toFixed(2)}</li>
      <li>Balances match expected: <strong>${balanceMatch ? 'yes' : 'no'}</strong></li>
      ${yieldWarning ? `<li style="color:#fbbf24;">Yield warning: ${yieldWarning.count} earning(s), $${yieldWarning.totalUsdt.toFixed(2)} USDT since allocate</li>` : ''}
    </ul>`,
  );
  const adminText = `EMMA reversal: de-allocate $${NET_INVESTED}, refund fee $${FEE_USDT}, remove deposit $${DEPOSIT_USDT}. Wallet $${before.walletBalance}→$${after.walletBalance}, Invest $${before.investmentBalance}→$${after.investmentBalance}. Expected match: ${balanceMatch}.`;

  const adminEmailSent = await sendEmail(
    ADMIN_EMAIL,
    adminSubject,
    adminHtml,
    adminText,
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        user: { id: USER_ID, email: EMAIL, displayName: afterUser?.displayName },
        before,
        after,
        expected: {
          walletBalance: EXPECTED_WALLET,
          investmentBalance: EXPECTED_INVEST,
        },
        balancesMatchExpected: balanceMatch,
        reverted: {
          deAllocateUsdt: NET_INVESTED,
          feeRefundUsdt: FEE_USDT,
          depositRemovalUsdt: DEPOSIT_USDT,
        },
        yieldWarning,
        emailsSent: {
          user: { to: EMAIL, subject: userSubject, sent: userEmailSent },
          admin: { to: ADMIN_EMAIL, subject: adminSubject, sent: adminEmailSent },
        },
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
