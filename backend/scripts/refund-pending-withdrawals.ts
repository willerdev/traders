/**
 * Refund all PENDING (non-approved) withdrawals.
 * - DEPOSITOR: credit gross amount back to platform wallet
 * - TP_REWARD / WEEKLY: reject only (funds were never debited)
 *
 * Usage: cd backend && npx tsx scripts/refund-pending-withdrawals.ts
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

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
  if (!apiKey) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(20000),
  });
  return res.ok;
}

async function refundDepositorPayout(payout: {
  id: string;
  userId: string;
  virtualProfit: unknown;
  notes: string | null;
}) {
  const refundRef = `refund_${payout.id}`;
  const existingRefund = await prisma.walletTransaction.findFirst({
    where: { referenceId: refundRef },
  });
  if (existingRefund) {
    return { skipped: true as const, reason: 'already_refunded' };
  }

  const amount = Number(payout.virtualProfit);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { skipped: true as const, reason: 'invalid_amount' };
  }

  const note = `Refund — pending withdrawal cancelled ($${amount.toFixed(2)} USDT)`;

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
      where: { id: payout.id },
      data: {
        status: 'REJECTED',
        processedAt: new Date(),
        notes: `${payout.notes ?? ''} — refunded by admin ${ADMIN_ID}: ${note}`.trim(),
      },
    });

    const momo = await tx.momoP2pWithdrawal.findUnique({
      where: { payoutId: payout.id },
    });
    if (momo && momo.status !== 'COMPLETED' && momo.status !== 'CANCELLED') {
      await tx.momoP2pWithdrawal.update({
        where: { id: momo.id },
        data: { status: 'CANCELLED' },
      });
    }

    return newBalance;
  });

  return { skipped: false as const, amount, balance };
}

async function rejectNonWalletPayout(payout: {
  id: string;
  notes: string | null;
}) {
  await prisma.payout.update({
    where: { id: payout.id },
    data: {
      status: 'REJECTED',
      processedAt: new Date(),
      notes: `${payout.notes ?? ''} — cancelled: non-approved payout cleared by admin ${ADMIN_ID}`.trim(),
    },
  });
}

async function main() {
  const pending = await prisma.payout.findMany({
    where: { status: 'PENDING' },
    orderBy: { requestedAt: 'asc' },
    include: {
      user: { select: { email: true, displayName: true } },
    },
  });

  const results: Array<Record<string, unknown>> = [];

  for (const payout of pending) {
    const email = payout.user.email?.trim().toLowerCase();
    const name = payout.user.displayName?.trim() || 'there';

    if (payout.source === 'DEPOSITOR') {
      const result = await refundDepositorPayout(payout);
      if (result.skipped) {
        results.push({
          payoutId: payout.id,
          email,
          source: payout.source,
          action: 'skipped',
          reason: result.reason,
        });
        continue;
      }

      if (email) {
        const html = layout(
          'Withdrawal cancelled — funds returned',
          `<p>Hi ${escapeHtml(name)},</p>
          <p>Your pending withdrawal of <strong>$${result.amount.toFixed(2)} USDT</strong> was cancelled and the full amount has been returned to your platform wallet.</p>
          <p>New available balance: <strong>$${result.balance.toFixed(2)} USDT</strong></p>
          <p style="color:#94a3b8;font-size:14px;">You can submit a new withdrawal from your wallet when ready.</p>`,
        );
        await sendEmail(
          email,
          'Withdrawal cancelled — funds returned to your wallet',
          html,
          `Your pending $${result.amount.toFixed(2)} USDT withdrawal was cancelled and returned. Balance: $${result.balance.toFixed(2)} USDT.`,
        );
      }

      results.push({
        payoutId: payout.id,
        email,
        source: payout.source,
        action: 'refunded',
        amount: result.amount,
        balance: result.balance,
      });
      console.log(`refunded ${email} $${result.amount.toFixed(2)}`);
      continue;
    }

    await rejectNonWalletPayout(payout);
    results.push({
      payoutId: payout.id,
      email,
      source: payout.source,
      action: 'rejected',
    });
    console.log(`rejected ${payout.source} ${email ?? payout.userId}`);
  }

  console.log(
    JSON.stringify(
      {
        pendingCount: pending.length,
        refunded: results.filter((r) => r.action === 'refunded').length,
        rejected: results.filter((r) => r.action === 'rejected').length,
        skipped: results.filter((r) => r.action === 'skipped').length,
        results,
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
