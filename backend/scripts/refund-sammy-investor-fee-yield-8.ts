/**
 * One-off: refund Sammy's $200 Smart Invest enrollment fee, set 8% daily yield, notify by email.
 *
 * Usage: cd backend && npx tsx scripts/refund-sammy-investor-fee-yield-8.ts
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
const USER_ID = 'cmsg0a74d069iku01m7skci5y';
const EMAIL = 'mugerwas@gmail.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const REFUND_USD = 200;
const REFERENCE_ID = 'sammy_investor_fee_refund_2026-08-30';
const ORIGINAL_FEE_REFERENCE = 'cmtadhn4c0ym5lo01ivtdtkz9';
const DAILY_YIELD_PERCENT = 8;

const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const emailFrom =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';

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
        body: JSON.stringify({ from: emailFrom, to: [to], subject, html, text }),
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
    include: {
      platformWallet: true,
      investorSettings: true,
      savedWithdrawalWallets: { select: { id: true, label: true, network: true, address: true } },
    },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: expected ${EMAIL}, got ${user.email}`);
  }

  const feeTx = await prisma.walletTransaction.findFirst({
    where: { userId: USER_ID, type: 'INVESTOR_FEE', referenceId: ORIGINAL_FEE_REFERENCE },
  });
  if (!feeTx) {
    throw new Error('Original INVESTOR_FEE transaction not found — verify before refunding');
  }
  const feeAmount = Math.abs(Number(feeTx.amount));
  if (feeAmount !== REFUND_USD) {
    throw new Error(`Expected fee $${REFUND_USD}, found $${feeAmount}`);
  }

  const existingRefund = await prisma.walletTransaction.findFirst({
    where: { referenceId: REFERENCE_ID },
  });
  if (existingRefund) {
    const wallet = await prisma.platformWallet.findUnique({ where: { userId: USER_ID } });
    const settings = await prisma.investorSettings.findUnique({ where: { userId: USER_ID } });
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'already_processed',
          refundAmount: REFUND_USD,
          walletBalance: Number(wallet?.availableBalance ?? 0),
          investBalance: Number(wallet?.investorBalance ?? 0),
          dailyYieldPercent: Number(settings?.dailyYieldPercent ?? null),
          savedWalletCount: user.savedWithdrawalWallets.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const name = user.displayName?.trim() || 'there';
  const before = {
    walletBalance: Number(user.platformWallet?.availableBalance ?? 0),
    investBalance: Number(user.platformWallet?.investorBalance ?? 0),
    dailyYieldPercent: user.investorSettings?.dailyYieldPercent
      ? Number(user.investorSettings.dailyYieldPercent)
      : null,
  };

  const walletBalance = await prisma.$transaction(async (tx) => {
    const wallet = await tx.platformWallet.upsert({
      where: { userId: USER_ID },
      create: { userId: USER_ID },
      update: {},
    });
    const newBalance =
      Math.round((Number(wallet.availableBalance) + REFUND_USD) * 100) / 100;

    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: newBalance },
    });
    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: REFUND_USD,
        type: 'ADJUSTMENT',
        referenceId: REFERENCE_ID,
        description: `Smart Invest enrollment fee refund — $${REFUND_USD.toFixed(2)} USDT (admin adjustment, original fee ref ${ORIGINAL_FEE_REFERENCE})`,
        balanceAfter: newBalance,
      },
    });

    return newBalance;
  });

  await prisma.investorSettings.update({
    where: { userId: USER_ID },
    data: { dailyYieldPercent: DAILY_YIELD_PERCENT },
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'ADMIN_ADJUSTMENT',
      targetId: USER_ID,
      metadata: {
        source: 'refund-sammy-investor-fee-yield-8',
        refundAmount: REFUND_USD,
        originalFeeReference: ORIGINAL_FEE_REFERENCE,
        walletBalance,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
      },
    },
  });

  const wallet = await prisma.platformWallet.findUnique({ where: { userId: USER_ID } });
  const settings = await prisma.investorSettings.findUnique({ where: { userId: USER_ID } });
  const savedWallets = await prisma.savedWithdrawalWallet.findMany({
    where: { userId: USER_ID },
    select: { id: true, label: true, network: true },
  });
  const hasSavedWallet = savedWallets.length > 0;

  const walletReminder = hasSavedWallet
    ? ''
    : `<p style="color:#fbbf24;font-size:14px"><strong>Action needed:</strong> You do not have a saved withdrawal wallet on file. Please add your USDT (TRC20) address on the <a href="${frontendUrl}/wallet" style="color:#93c5fd">Wallet</a> page so future withdrawals can be processed smoothly.</p>`;

  const walletReminderText = hasSavedWallet
    ? ''
    : ' Please add your withdrawal wallet on the Wallet page for future withdrawals.';

  const html = layout(
    'Smart Invest account update',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>We have applied the following updates to your Smart Invest account:</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li><strong>Enrollment fee refunded:</strong> $${REFUND_USD.toFixed(2)} USDT has been credited back to your platform wallet.</li>
      <li><strong>Daily yield rate:</strong> Your account is now set to <strong>${DAILY_YIELD_PERCENT}% daily yield</strong> on your Smart Invest balance.</li>
    </ul>
    <p>Current balances:</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>Platform wallet: <strong>$${Number(wallet?.availableBalance ?? 0).toFixed(2)} USDT</strong></li>
      <li>Smart Invest: <strong>$${Number(wallet?.investorBalance ?? 0).toFixed(2)} USDT</strong></li>
    </ul>
    ${walletReminder}
    ${button(`${frontendUrl}/wallet`, 'View wallet')}`,
  );

  const text = `Hi ${name}, your Smart Invest enrollment fee of $${REFUND_USD.toFixed(2)} USDT has been refunded to your wallet. Your daily yield is now ${DAILY_YIELD_PERCENT}%. Wallet: $${Number(wallet?.availableBalance ?? 0).toFixed(2)} USDT. Smart Invest: $${Number(wallet?.investorBalance ?? 0).toFixed(2)} USDT.${walletReminderText}`;

  const emailSent = await sendEmail(
    EMAIL,
    `Smart Invest update — $${REFUND_USD.toFixed(2)} fee refunded, ${DAILY_YIELD_PERCENT}% daily yield`,
    html,
    text,
  );

  console.log(
    JSON.stringify(
      {
        userId: USER_ID,
        email: EMAIL,
        refundAmount: REFUND_USD,
        before,
        after: {
          walletBalance: Number(wallet?.availableBalance ?? 0),
          investBalance: Number(wallet?.investorBalance ?? 0),
          dailyYieldPercent: Number(settings?.dailyYieldPercent ?? DAILY_YIELD_PERCENT),
        },
        savedWalletStatus: hasSavedWallet
          ? { hasSavedWallet: true, wallets: savedWallets }
          : { hasSavedWallet: false },
        emailSent,
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
