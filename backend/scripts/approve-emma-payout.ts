/**
 * Admin one-off: approve EMMA (etuyizere64@gmail.com) pending wallet withdrawal.
 * Bypasses 72h instant-withdraw safety hold per explicit admin request.
 *
 * Usage: cd backend && npx tsx scripts/approve-emma-payout.ts
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
const PAYOUT_ID = 'cmtbgch9x01sjme01kutljpne';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';

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

async function main() {
  if (!apiKey || !payoutEmail || !payoutPassword) {
    throw new Error('NOWPayments payout credentials missing in backend/.env');
  }

  const before = await prisma.payout.findUnique({
    where: { id: PAYOUT_ID },
    include: {
      user: {
        select: {
          email: true,
          displayName: true,
          instantWithdraw: true,
          instantWithdrawKycExempt: true,
          kyc: { select: { status: true } },
        },
      },
    },
  });

  if (!before) throw new Error(`Payout ${PAYOUT_ID} not found`);
  if (before.status !== 'PENDING') {
    console.log(JSON.stringify({ message: 'Already processed', status: before.status }, null, 2));
    return;
  }

  const destination = before.walletAddress?.trim();
  if (!destination) throw new Error('Payout destination wallet missing');

  const amount = Number(before.traderShare);
  console.log('Before:', {
    status: before.status,
    amount,
    wallet: destination,
    kyc: before.user.kyc?.status ?? 'NONE',
    kycExempt: before.user.instantWithdrawKycExempt,
  });

  const gateway = await createNowPayout(destination, amount);

  const after = await prisma.payout.update({
    where: { id: PAYOUT_ID },
    data: {
      gatewayPayoutId: gateway.id,
      status: 'APPROVED',
      notes: `${before.notes ?? ''} — NOWPayments batch ${gateway.id} (admin ${ADMIN_ID}, script skipSafetyHold)`.trim(),
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'PAYOUT_APPROVED',
      targetId: PAYOUT_ID,
      metadata: {
        userId: before.userId,
        amount,
        settlement: 'gateway',
        gatewayPayoutId: gateway.id,
        source: 'admin-script-approve-emma-payout',
        skipSafetyHold: true,
      },
    },
  });

  const emailed = await sendPayoutApprovedEmail(
    before.user.email!,
    before.user.displayName,
    {
      amount,
      walletAddress: destination,
      weekNumber: before.weekNumber,
      year: before.year,
    },
  );

  console.log('After:', {
    status: after.status,
    gatewayPayoutId: after.gatewayPayoutId,
    emailSent: emailed,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
