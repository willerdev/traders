/**
 * Admin one-off: submit full platform wallet withdrawal for Beatrice
 * (dngororanod@gmail.com). Bypasses email OTP per explicit admin request.
 * Does NOT touch Smart Invest (investorBalance).
 *
 * Usage: cd backend && npx tsx scripts/withdraw-beatrice-wallet.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { quoteWithdrawalFees } from '../src/wallet/withdrawal-schedule';

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
const USER_ID = 'cmsg56vj607fwku0137qv270f';
const EMAIL = 'dngororanod@gmail.com';
const SAVED_WALLET_ID = 'cmsrbmy2n05efkh01dc7e3gb7';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';

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

function isoWeekYear(date: Date): { weekNumber: number; year: number } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { weekNumber, year: d.getUTCFullYear() };
}

async function quoteUsdtToUgx(amountUsdt: number) {
  const url =
    'https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=UGX&asset=USDT&tradeType=BUY';
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'TraderRankPro/1.0' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Binance C2C HTTP ${res.status}`);
  const body = (await res.json()) as {
    success?: boolean;
    data?: { price?: string | number };
  };
  const price = Number(body?.data?.price);
  if (!body?.success || !Number.isFinite(price) || price <= 0) {
    throw new Error('Binance C2C returned an invalid price');
  }
  const usdt = Math.round(amountUsdt * 100) / 100;
  return {
    price,
    amountUsdt: usdt,
    amountUgx: Math.round(usdt * price * 100) / 100,
  };
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!resendKey) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: emailFrom, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(20000),
  });
  return res.ok;
}

async function main() {
  const [user, wallet, savedWallet, config, kyc, pendingPayout] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: USER_ID },
        select: {
          id: true,
          email: true,
          displayName: true,
          status: true,
          investorActive: true,
          investorVipActive: true,
          investorVvipActive: true,
          instantWithdraw: true,
        },
      }),
      prisma.platformWallet.findUnique({ where: { userId: USER_ID } }),
      prisma.savedWithdrawalWallet.findFirst({
        where: { id: SAVED_WALLET_ID, userId: USER_ID },
      }),
      prisma.platformConfig.findUnique({ where: { id: 'default' } }),
      prisma.kycVerification.findUnique({
        where: { userId: USER_ID },
        select: { status: true },
      }),
      prisma.payout.findFirst({
        where: { userId: USER_ID, source: 'DEPOSITOR', status: 'PENDING' },
      }),
    ]);

  if (!user) throw new Error(`User ${USER_ID} not found`);
  if (user.email?.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: expected ${EMAIL}, got ${user.email}`);
  }
  if (!wallet) throw new Error('Platform wallet not found');
  if (!savedWallet) throw new Error('Saved withdrawal wallet not found');
  if (kyc?.status !== 'APPROVED') {
    throw new Error(`KYC not approved (${kyc?.status ?? 'NONE'})`);
  }
  if (pendingPayout) {
    throw new Error(`User already has pending payout ${pendingPayout.id}`);
  }
  if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
    throw new Error(`Account status ${user.status} cannot withdraw`);
  }

  const grossAmount = Math.round(Number(wallet.availableBalance) * 100) / 100;
  if (grossAmount <= 0) throw new Error('No available wallet balance');

  const quote = quoteWithdrawalFees({
    grossUsdt: grossAmount,
    processingFeeUsdt: user.investorVipActive
      ? 0
      : Number(config?.walletWithdrawalFeeUsdt ?? 3),
    scheduleEnabled: config?.withdrawalScheduleEnabled !== false,
    preferredSchedule:
      String(config?.withdrawalPreferredSchedule || 'WEEKLY').toUpperCase() ===
      'MONTHLY'
        ? 'MONTHLY'
        : 'WEEKLY',
    offSchedulePenaltyPercent: Number(
      config?.withdrawalOffSchedulePenaltyPercent ?? 8,
    ),
  });

  const fee = quote.totalFeesUsdt;
  const netPayout = quote.netPayoutUsdt;
  const processingFeeOnly = quote.processingFeeUsdt;
  const penaltyUsdt = quote.penaltyUsdt;

  if (fee > 0 && grossAmount <= fee) {
    throw new Error(`Gross $${grossAmount} does not exceed fees $${fee}`);
  }
  if (netPayout <= 0) throw new Error('Net payout would be zero after fees');

  const investorBalance = Number(wallet.investorBalance);
  console.log('Pre-check:', {
    grossAmount,
    fee,
    netPayout,
    processingFeeOnly,
    penaltyUsdt,
    investorBalance,
    savedWallet: {
      id: savedWallet.id,
      label: savedWallet.label,
      address: savedWallet.address,
      network: savedWallet.network,
    },
  });

  const rateQuote = await quoteUsdtToUgx(netPayout);
  const destination = savedWallet.address;
  const walletLabel = savedWallet.label;
  const { weekNumber, year } = isoWeekYear(new Date());

  const feeLabel =
    penaltyUsdt > 0
      ? `$${processingFeeOnly.toFixed(2)} fee + $${penaltyUsdt.toFixed(2)} off-schedule penalty (${quote.penaltyPercent}%)`
      : processingFeeOnly > 0
        ? `$${processingFeeOnly.toFixed(2)} fee`
        : 'VIP $0 fee';

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.platformWallet.findUnique({
      where: { userId: USER_ID },
    });
    const available = Number(current?.availableBalance ?? 0);
    if (available < grossAmount) {
      throw new Error(
        `Insufficient balance: have $${available}, need $${grossAmount}`,
      );
    }
    const balanceAfter = Math.round((available - grossAmount) * 100) / 100;

    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: balanceAfter },
    });

    const payout = await tx.payout.create({
      data: {
        userId: USER_ID,
        source: 'DEPOSITOR',
        virtualProfit: grossAmount,
        traderShare: netPayout,
        platformShare: fee,
        traderPercent:
          grossAmount > 0
            ? Math.round((netPayout / grossAmount) * 10000) / 100
            : 100,
        weekNumber,
        year,
        status: 'PENDING',
        walletAddress: destination,
        payoutMethod: 'MOBILE_MONEY',
        notes: [
          'MoMo P2P',
          `withdrawal — $${grossAmount.toFixed(2)} USDT gross`,
          `$${processingFeeOnly.toFixed(2)} processing fee`,
          penaltyUsdt > 0
            ? `$${penaltyUsdt.toFixed(2)} off-schedule penalty (${quote.penaltyPercent}% · preferred ${quote.preferredWindowLabel})`
            : `on-schedule (${quote.preferredWindowLabel})`,
          `$${netPayout.toFixed(2)} USDT → UGX ${rateQuote.amountUgx.toLocaleString('en-US')} @ ${rateQuote.price}`,
          `send to ${destination} (${savedWallet.network})`,
          `who: ${user.displayName} <${user.email}>`,
          `admin script withdraw-beatrice-wallet (${ADMIN_ID})`,
        ].join(', '),
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -grossAmount,
        type: 'DEPOSITOR_WITHDRAW',
        description: `MoMo withdrawal — $${grossAmount.toFixed(2)} USDT (${feeLabel}, $${netPayout.toFixed(2)} payout) → ${walletLabel}`,
        balanceAfter,
      },
    });

    const p2p = await tx.momoP2pWithdrawal.create({
      data: {
        userId: USER_ID,
        payoutId: payout.id,
        amountUsdt: netPayout,
        amountUgx: rateQuote.amountUgx,
        rateUgxPerUsdt: rateQuote.price,
        momoNetwork: savedWallet.network,
        momoPhone: destination,
        momoLabel: walletLabel,
        recipientName: user.displayName,
        status: 'UNDER_PROCESS',
        opsEmailSentAt: new Date(),
      },
    });

    return { payout, p2p, balanceAfter };
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'ADMIN_ADJUSTMENT',
      targetId: USER_ID,
      metadata: {
        source: 'withdraw-beatrice-wallet',
        payoutId: result.payout.id,
        p2pId: result.p2p.id,
        grossAmount,
        netPayout,
        fee,
        destination,
        network: savedWallet.network,
        investorBalanceUntouched: investorBalance,
      },
    },
  });

  const name = user.displayName?.trim() || 'there';
  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">Withdrawal requested</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>We received your withdrawal request for <strong>$${grossAmount.toFixed(2)} USDT</strong>.</p>
    <p>Net payout after fees: <strong>$${netPayout.toFixed(2)} USDT</strong> (~UGX ${Math.round(rateQuote.amountUgx).toLocaleString('en-US')}) to <strong>${escapeHtml(destination)}</strong> (${escapeHtml(savedWallet.network)}).</p>
    <p>You will receive an email when the transfer is processed.</p>
    <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a></p>
  </div></body></html>`;

  const emailSent = await sendEmail(
    EMAIL,
    'Withdrawal requested',
    html,
    `Withdrawal of $${grossAmount.toFixed(2)} USDT requested. Net $${netPayout.toFixed(2)} USDT to ${destination}.`,
  );

  const afterWallet = await prisma.platformWallet.findUnique({
    where: { userId: USER_ID },
  });

  console.log(
    JSON.stringify(
      {
        user: { id: USER_ID, email: EMAIL, displayName: user.displayName },
        grossAmount,
        fees: {
          total: fee,
          processing: processingFeeOnly,
          penalty: penaltyUsdt,
        },
        netPayout,
        amountUgx: rateQuote.amountUgx,
        rateUgxPerUsdt: rateQuote.price,
        destination: {
          walletId: savedWallet.id,
          label: walletLabel,
          address: destination,
          network: savedWallet.network,
        },
        payoutId: result.payout.id,
        p2pId: result.p2p.id,
        status: result.payout.status,
        p2pStatus: result.p2p.status,
        walletAfter: {
          availableBalance: Number(afterWallet?.availableBalance ?? 0),
          investorBalance: Number(afterWallet?.investorBalance ?? 0),
        },
        kyc: kyc.status,
        emailSent,
        blockers: [],
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
