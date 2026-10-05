/**
 * Resume Sunday TRC20 withdraw batch — approve all due (or forced) PENDING payouts now.
 * Uses production DB + NOWPayments from backend/.env (same as cron).
 *
 * Usage:
 *   cd backend && npx tsx scripts/resume-sunday-batch-now.ts
 *   FORCE=1 npx tsx scripts/resume-sunday-batch-now.ts   # ignore schedule, run all PENDING
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  formatKampalaDateTime,
  SUNDAY_BATCH_CRON_ACTOR,
  sundayUtcStart,
} from '../src/payouts/sunday-withdraw-batch.util';

function loadEnv() {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnv();

const prisma = new PrismaClient();
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const force = process.env.FORCE === '1' || process.env.FORCE === 'true';

const apiKey = (process.env.NOWPAYMENTS_API_KEY || '').replace(/^['"]|['"]$/g, '');
const apiUrl =
  (process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1').replace(
    /\/$/,
    '',
  );
const payoutEmail = (
  process.env.NOWPAYMENTS_PAYOUT_EMAIL ||
  process.env.NOW_PAYMENTS_PAYOUT_EMAIL ||
  ''
).replace(/^['"]|['"]$/g, '');
const payoutPassword = (
  process.env.NOWPAYMENTS_PAYOUT_PASSWORD ||
  process.env.NOW_PAYMENTS_PAYOUT_PASSWORD ||
  ''
).replace(/^['"]|['"]$/g, '');
const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const emailFrom =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';
const ipnUrl =
  process.env.NOWPAYMENTS_PAYOUT_IPN_URL ||
  process.env.NOWPAYMENTS_IPN_URL ||
  '';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sumUsdtBalance(
  balances: Record<string, { amount?: number }>,
): number {
  const keys = ['usdttrc20', 'usdtbsc', 'usdterc20', 'usdt'];
  let total = 0;
  for (const key of keys) {
    const entry = balances[key];
    if (entry?.amount != null && Number.isFinite(entry.amount)) {
      total += entry.amount;
    }
  }
  return Math.round(total * 100) / 100;
}

async function nowRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (body as { message?: string }).message ||
      `NOWPayments error ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

async function getPayoutToken(): Promise<string> {
  const result = await nowRequest<{ token: string }>('/auth', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: payoutEmail, password: payoutPassword }),
  });
  return result.token;
}

async function getNowBalance() {
  return nowRequest<Record<string, { amount?: number; pendingAmount?: number }>>(
    '/balance',
    { headers: { 'x-api-key': apiKey } },
  );
}

async function createNowPayout(address: string, amount: number) {
  const token = await getPayoutToken();
  return nowRequest<{ id: string }>('/payout', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(ipnUrl ? { ipn_callback_url: ipnUrl } : {}),
      withdrawals: [
        {
          address,
          currency: 'usdttrc20',
          amount,
          ...(ipnUrl ? { ipn_callback_url: ipnUrl } : {}),
        },
      ],
    }),
  });
}

async function sendPayoutApprovedEmail(
  to: string,
  name: string,
  data: {
    amount: number;
    walletAddress: string;
    weekNumber: number;
    year: number;
  },
) {
  if (!resendKey) return false;
  const wallet = `${data.walletAddress.slice(0, 8)}…${data.walletAddress.slice(-6)}`;
  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">Payout approved</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your payout for week <strong>${data.weekNumber}, ${data.year}</strong> has been approved.</p>
    <p><strong>$${data.amount.toFixed(2)} USDT</strong> is being sent to <code style="color:#93c5fd;">${escapeHtml(wallet)}</code>.</p>
    <p><a href="${frontendUrl}/payouts" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View payouts</a></p>
  </div></body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [to],
      subject: `Payout approved — $${data.amount.toFixed(2)}`,
      html,
      text: `Payout approved: $${data.amount.toFixed(2)} to ${wallet}`,
    }),
    signal: AbortSignal.timeout(20000),
  });
  return res.ok;
}

type ActionResult = {
  payoutId: string;
  name: string;
  email: string | null;
  amount: number;
  action: 'skipped' | 'approved' | 'failed';
  reason?: string;
  gatewayPayoutId?: string;
  error?: string;
};

async function approveOne(payout: {
  id: string;
  traderShare: unknown;
  walletAddress: string | null;
  weekNumber: number;
  year: number;
  notes: string | null;
  user: { email: string | null; displayName: string };
}): Promise<ActionResult> {
  const base = {
    payoutId: payout.id,
    name: payout.user.displayName,
    email: payout.user.email,
    amount: Number(payout.traderShare),
  };

  const destination = payout.walletAddress?.trim();
  if (!destination) {
    return { ...base, action: 'failed', error: 'Missing wallet address' };
  }

  try {
    const gateway = await createNowPayout(destination, base.amount);

    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        gatewayPayoutId: gateway.id,
        status: 'APPROVED',
        processedAt: new Date(),
        notes: `${payout.notes ?? ''} — NOWPayments batch ${gateway.id} (${SUNDAY_BATCH_CRON_ACTOR} manual resume ${formatKampalaDateTime(new Date())} Kampala)`.trim(),
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'PAYOUT_APPROVED',
        targetId: payout.id,
        metadata: {
          userId: payout.id,
          amount: base.amount,
          settlement: 'gateway',
          gatewayPayoutId: gateway.id,
          source: 'resume-sunday-batch-now',
          skipSafetyHold: true,
        },
      },
    });

    if (payout.user.email) {
      await sendPayoutApprovedEmail(payout.user.email, payout.user.displayName, {
        amount: base.amount,
        walletAddress: destination,
        weekNumber: payout.weekNumber,
        year: payout.year,
      });
    }

    return {
      ...base,
      action: 'approved',
      gatewayPayoutId: gateway.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        notes: `${payout.notes ?? ''} — manual resume failed: ${message}`.trim(),
      },
    });
    return { ...base, action: 'failed', error: message };
  }
}

async function main() {
  if (!apiKey || !payoutEmail || !payoutPassword) {
    throw new Error('NOWPayments payout credentials missing in backend/.env');
  }

  const now = new Date();
  const dayStart = sundayUtcStart(now);

  let balanceUsdt = 0;
  let balanceRaw: Record<string, { amount?: number; pendingAmount?: number }> =
    {};
  try {
    balanceRaw = await getNowBalance();
    balanceUsdt = sumUsdtBalance(balanceRaw);
  } catch (err) {
    console.warn(
      'Could not fetch NOWPayments balance:',
      err instanceof Error ? err.message : err,
    );
  }

  const pendingAll = await prisma.payout.findMany({
    where: {
      status: 'PENDING',
      source: 'DEPOSITOR',
      scheduledApproveAt: { not: null, gte: dayStart },
    },
    include: {
      user: { select: { displayName: true, email: true } },
    },
    orderBy: { scheduledApproveAt: 'asc' },
  });

  const toProcess = force
    ? pendingAll
    : pendingAll.filter(
        (p) => p.scheduledApproveAt && p.scheduledApproveAt <= now,
      );

  const skipped = pendingAll.filter((p) => !toProcess.includes(p));

  const results: ActionResult[] = [];

  for (const payout of toProcess) {
    if (force && payout.scheduledApproveAt && payout.scheduledApproveAt > now) {
      await prisma.payout.update({
        where: { id: payout.id },
        data: { scheduledApproveAt: now },
      });
    }
    results.push(await approveOne(payout));
  }

  for (const payout of skipped) {
    results.push({
      payoutId: payout.id,
      name: payout.user.displayName,
      email: payout.user.email,
      amount: Number(payout.traderShare),
      action: 'skipped',
      reason: `Not due until ${formatKampalaDateTime(payout.scheduledApproveAt!)} Kampala`,
    });
  }

  const batch = await prisma.payout.findMany({
    where: {
      source: 'DEPOSITOR',
      scheduledApproveAt: { not: null, gte: dayStart },
    },
    include: { user: { select: { displayName: true, email: true } } },
    orderBy: { scheduledApproveAt: 'asc' },
  });

  const summary = {
    runAt: now.toISOString(),
    runEat: formatKampalaDateTime(now),
    force,
    nowPaymentsBalanceUsdt: balanceUsdt,
    nowPaymentsBalanceRaw: balanceRaw,
    triggeredThisRun: results.filter((r) => r.action === 'approved'),
    failedThisRun: results.filter((r) => r.action === 'failed'),
    skippedThisRun: results.filter((r) => r.action === 'skipped'),
    batchTotals: {
      total: batch.length,
      PAID: batch.filter((p) => p.status === 'PAID').length,
      APPROVED: batch.filter((p) => p.status === 'APPROVED').length,
      PENDING: batch.filter((p) => p.status === 'PENDING').length,
      FAILED: batch.filter((p) => p.status === 'FAILED').length,
      dispatched: batch.filter((p) => p.gatewayPayoutId).length,
    },
    batch: batch.map((p, i) => ({
      pos: i + 1,
      id: p.id,
      name: p.user.displayName,
      email: p.user.email,
      amount: Number(p.traderShare),
      status: p.status,
      gatewayPayoutId: p.gatewayPayoutId,
      scheduledEat: p.scheduledApproveAt
        ? formatKampalaDateTime(p.scheduledApproveAt)
        : null,
      processedEat: p.processedAt
        ? formatKampalaDateTime(p.processedAt)
        : null,
      triggeredThisRun: results.some(
        (r) => r.payoutId === p.id && r.action === 'approved',
      ),
    })),
    actions: results,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
