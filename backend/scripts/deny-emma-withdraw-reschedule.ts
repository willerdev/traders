/**
 * Admin one-off: deny EMMA withdrawals, reverse today's Smart Invest credit,
 * reschedule blockchain contract to start tomorrow, send notice email.
 *
 * Run follow-up in 24h: npx tsx scripts/credit-emma-smart-invest-refund.ts
 *
 * Usage: cd backend && npx tsx scripts/deny-emma-withdraw-reschedule.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { addKampalaWeekdays } from '../src/common/kampala-weekend.util';

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
const USER_ID = 'cms7wxc4g08u2ke01n7ineqld';
const EMAIL = 'etuyizere64@gmail.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const PAYOUT_IDS = [
  'cmtbp0fz001w7ki01dczuvr1m', // PENDING $1950 gross
  'cmtbgch9x01sjme01kutljpne', // APPROVED $9400 gross (batch 5006359408)
];
const SMART_INVEST_REFUND_USD = 166;
const KAMPALA_TZ = 'Africa/Kampala';
const CONTRACT_ACTIVATED_AT = new Date('2026-08-28T10:42:22.103Z');
const REFUND_DUE_AT = new Date(Date.now() + 24 * 60 * 60 * 1000);

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

function formatKampala(date: Date) {
  return date.toLocaleString('en-GB', {
    timeZone: KAMPALA_TZ,
    dateStyle: 'full',
    timeStyle: 'short',
  });
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

async function refundDepositorPayout(
  payoutId: string,
  reason: string,
): Promise<{ amount: number; balance: number; skipped?: string }> {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new Error(`Payout ${payoutId} not found`);
  if (payout.status === 'REJECTED') {
    return { amount: 0, balance: 0, skipped: 'already_rejected' };
  }

  const refundRef = `refund_${payoutId}`;
  const existingRefund = await prisma.walletTransaction.findFirst({
    where: { referenceId: refundRef },
  });
  if (existingRefund) {
    return { amount: 0, balance: 0, skipped: 'already_refunded' };
  }

  const amount = Number(payout.virtualProfit);
  const note = reason;

  const balance = await prisma.$transaction(async (tx) => {
    const wallet = await tx.platformWallet.upsert({
      where: { userId: payout.userId },
      create: { userId: payout.userId },
      update: {},
    });
    const newBalance = Math.round((Number(wallet.availableBalance) + amount) * 100) / 100;

    await tx.platformWallet.update({
      where: { userId: payout.userId },
      data: { availableBalance: newBalance },
    });
    await tx.walletTransaction.create({
      data: {
        userId: payout.userId,
        amount,
        type: 'ADJUSTMENT',
        description: note,
        referenceId: refundRef,
        balanceAfter: newBalance,
      },
    });
    await tx.payout.update({
      where: { id: payoutId },
      data: {
        status: 'REJECTED',
        processedAt: new Date(),
        notes: `${payout.notes ?? ''} — refunded by admin ${ADMIN_ID}: ${note}`.trim(),
      },
    });

    return newBalance;
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'PAYOUT_REFUNDED',
      targetId: payoutId,
      metadata: {
        userId: payout.userId,
        amount,
        balance,
        reason,
        source: 'deny-emma-withdraw-reschedule',
      },
    },
  });

  return { amount, balance };
}

async function reverseTodayInvestorCredit(today: Date) {
  const credit = await prisma.investorDailyCredit.findUnique({
    where: { userId_creditDate: { userId: USER_ID, creditDate: today } },
  });
  if (!credit) return { reversed: false as const, reason: 'no_credit' };

  const amount = Number(credit.amount);
  const reverseRef = `reverse_investor_earning_${today.toISOString().slice(0, 10)}`;

  const existing = await prisma.walletTransaction.findFirst({
    where: { referenceId: reverseRef },
  });
  if (existing) return { reversed: false as const, reason: 'already_reversed', amount };

  const balance = await prisma.$transaction(async (tx) => {
    await tx.investorDailyCredit.delete({
      where: { userId_creditDate: { userId: USER_ID, creditDate: today } },
    });

    const wallet = await tx.platformWallet.findUnique({ where: { userId: USER_ID } });
    const current = Number(wallet?.availableBalance ?? 0);
    const newBalance = Math.round((current - amount) * 100) / 100;

    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: newBalance },
    });
    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -amount,
        type: 'ADJUSTMENT',
        referenceId: reverseRef,
        description: `Reversal — Smart Invest daily earning $${amount.toFixed(2)} USDT (${today.toISOString().slice(0, 10)}); scheduled refund $${SMART_INVEST_REFUND_USD.toFixed(2)} at ${REFUND_DUE_AT.toISOString()}`,
        balanceAfter: newBalance,
      },
    });

    return newBalance;
  });

  return { reversed: true as const, amount, balance };
}

async function rescheduleContract(today: Date) {
  const lockedUntil = addKampalaWeekdays(CONTRACT_ACTIVATED_AT, 5);

  const chainCredit = await prisma.chainDailyCredit.findFirst({
    where: { userId: USER_ID, creditDate: today },
  });

  await prisma.$transaction(async (tx) => {
    if (chainCredit) {
      await tx.chainDailyCredit.delete({ where: { id: chainCredit.id } });
      const reward = await tx.chainReward.findFirst({
        where: { userId: USER_ID, hash: { contains: today.toISOString().slice(0, 10) } },
      });
      if (reward) {
        await tx.chainReward.delete({ where: { id: reward.id } });
      }
    }

    await tx.chainContractEnrollment.update({
      where: { userId: USER_ID },
      data: {
        activatedAt: CONTRACT_ACTIVATED_AT,
        status: 'ACTIVE',
      },
    });

    await tx.chainVaultPosition.update({
      where: { userId: USER_ID },
      data: { lockedUntil },
    });
  });

  return {
    activatedAt: CONTRACT_ACTIVATED_AT.toISOString(),
    lockedUntil: lockedUntil.toISOString(),
    removedChainCredit: chainCredit
      ? { amount: Number(chainCredit.amount), creditDate: chainCredit.creditDate }
      : null,
  };
}

async function snapshot(label: string) {
  const [wallet, payouts, enrollment, vault, investorCredit, chainCredit] =
    await Promise.all([
      prisma.platformWallet.findUnique({ where: { userId: USER_ID } }),
      prisma.payout.findMany({
        where: { userId: USER_ID, id: { in: PAYOUT_IDS } },
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.chainContractEnrollment.findUnique({ where: { userId: USER_ID } }),
      prisma.chainVaultPosition.findUnique({ where: { userId: USER_ID } }),
      prisma.investorDailyCredit.findFirst({
        where: {
          userId: USER_ID,
          creditDate: new Date('2026-08-27T00:00:00.000Z'),
        },
      }),
      prisma.chainDailyCredit.findFirst({
        where: {
          userId: USER_ID,
          creditDate: new Date('2026-08-27T00:00:00.000Z'),
        },
      }),
    ]);

  return {
    label,
    wallet: wallet
      ? {
          availableBalance: Number(wallet.availableBalance),
          investorBalance: Number(wallet.investorBalance),
        }
      : null,
    payouts: payouts.map((p) => ({
      id: p.id,
      status: p.status,
      virtualProfit: Number(p.virtualProfit),
      traderShare: Number(p.traderShare),
      gatewayPayoutId: p.gatewayPayoutId,
    })),
    enrollment: enrollment
      ? {
          status: enrollment.status,
          activatedAt: enrollment.activatedAt?.toISOString() ?? null,
        }
      : null,
    vault: vault
      ? {
          principalBalance: Number(vault.principalBalance),
          profitBalance: Number(vault.profitBalance),
          lockedUntil: vault.lockedUntil.toISOString(),
        }
      : null,
    investorCreditToday: investorCredit
      ? { amount: Number(investorCredit.amount) }
      : null,
    chainCreditToday: chainCredit ? { amount: Number(chainCredit.amount) } : null,
  };
}

async function main() {
  const today = new Date('2026-08-27T00:00:00.000Z');
  const before = await snapshot('before');

  const refundResults = [];
  for (const payoutId of PAYOUT_IDS) {
    const result = await refundDepositorPayout(
      payoutId,
      'Withdrawal denied — funds not available on platform wallet; refunded to wallet',
    );
    refundResults.push({ payoutId, ...result });
  }

  const investorReversal = await reverseTodayInvestorCredit(today);
  const contractReschedule = await rescheduleContract(today);

  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: { displayName: true, email: true },
  });
  const name = user?.displayName?.trim() || 'EMMA';
  const refundDueLabel = formatKampala(REFUND_DUE_AT);
  const contractStartLabel = formatKampala(CONTRACT_ACTIVATED_AT);

  const html = layout(
    'Withdrawal update — Smart Invest & blockchain contract',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>We reviewed your recent withdrawal request and are writing with an update.</p>
    <p><strong>Withdrawal cannot be processed</strong> because the requested amount is not available in your platform wallet balance at this time.</p>
    <p>Any debited withdrawal amounts have been returned to your platform wallet.</p>
    <hr style="border:none;border-top:1px solid #334155;margin:20px 0" />
    <p><strong>Smart Invest refund — $${SMART_INVEST_REFUND_USD.toFixed(2)} USDT</strong></p>
    <p>Today's Smart Invest earning will be refunded to your platform wallet on <strong>${escapeHtml(refundDueLabel)}</strong> (24 hours from this notice).</p>
    <hr style="border:none;border-top:1px solid #334155;margin:20px 0" />
    <p><strong>Blockchain contract</strong></p>
    <p>Your blockchain contract has been rescheduled. Daily counting will begin on <strong>${escapeHtml(contractStartLabel)}</strong>.</p>
    <p style="color:#94a3b8;font-size:14px;">If you have questions, reply to this email or contact support through your dashboard.</p>
    <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a></p>`,
  );

  const text = `Hi ${name}, your withdrawal cannot be processed because the funds are not available in your platform wallet. Debited amounts were returned. Smart Invest refund of $${SMART_INVEST_REFUND_USD.toFixed(2)} USDT will be credited on ${refundDueLabel}. Blockchain contract counting starts ${contractStartLabel}. ${frontendUrl}/wallet`;

  const emailSent = await sendEmail(
    EMAIL,
    'Withdrawal update — refund scheduled & contract rescheduled',
    html,
    text,
  );

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'ADMIN_ADJUSTMENT',
      targetId: USER_ID,
      metadata: {
        source: 'deny-emma-withdraw-reschedule',
        refundResults,
        investorReversal,
        contractReschedule,
        smartInvestRefundDueAt: REFUND_DUE_AT.toISOString(),
        smartInvestRefundUsd: SMART_INVEST_REFUND_USD,
        emailSent,
      },
    },
  });

  const after = await snapshot('after');

  console.log(
    JSON.stringify(
      {
        before,
        refundResults,
        investorReversal,
        contractReschedule,
        smartInvestRefund: {
          amountUsd: SMART_INVEST_REFUND_USD,
          dueAt: REFUND_DUE_AT.toISOString(),
          dueAtKampala: refundDueLabel,
          followUpScript: 'npx tsx scripts/credit-emma-smart-invest-refund.ts',
        },
        emailSent,
        after,
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
