/**
 * One-off: move $110 Smart Invest → wallet for nenshiboy@gmail.com (admin transfer, no fee),
 * enable instant yield (no 24h hold), and email Ezra.
 * Usage: cd backend && npx tsx scripts/redeem-nenshiboy-110.ts
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

const USER_ID = 'cmrave21l019jl901c6acxcr9';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'nenshiboy@gmail.com';
const REDEEM_USDT = 110;

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
  if (!user.investorActive) {
    throw new Error('User is not enrolled in Smart Invest');
  }

  const wallet =
    user.platformWallet ??
    (await prisma.platformWallet.create({ data: { userId: USER_ID } }));
  const availableBefore = Number(wallet.availableBalance);
  const investedBefore = Number(wallet.investorBalance ?? 0);

  if (investedBefore < REDEEM_USDT) {
    throw new Error(
      `Insufficient investment balance — need $${REDEEM_USDT.toFixed(2)} but have $${investedBefore.toFixed(2)}`,
    );
  }

  const before = {
    walletBalance: availableBefore,
    investmentBalance: investedBefore,
    instantWithdraw: user.instantWithdraw,
    instantWithdrawGrantedAt: user.instantWithdrawGrantedAt?.toISOString() ?? null,
  };

  const rounded = REDEEM_USDT;
  const nextAvailable = Math.round((availableBefore + rounded) * 100) / 100;
  const nextInvested = Math.round((investedBefore - rounded) * 100) / 100;
  const now = new Date();

  await prisma.$transaction([
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
        amount: rounded,
        type: 'INVESTOR_REDEEM',
        referenceId: `admin_${ADMIN_ID}`,
        description: `Admin moved $${rounded.toFixed(2)} USDT from investment to wallet`,
        balanceAfter: nextAvailable,
      },
    }),
    prisma.user.update({
      where: { id: USER_ID },
      data: {
        instantWithdraw: true,
        instantWithdrawGrantedAt: user.instantWithdrawGrantedAt ?? now,
        instantWithdrawGrantedById: user.instantWithdrawGrantedById ?? ADMIN_ID,
      },
    }),
    prisma.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_TRANSFER',
        targetId: USER_ID,
        metadata: {
          amount: rounded,
          direction: 'to_wallet',
          feeAmount: 0,
          feePercent: 0,
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INSTANT_WITHDRAW_WHITELIST',
        targetId: USER_ID,
        metadata: {
          enabled: true,
          instantYield: true,
          note: 'No 24h yield hold on new Smart Invest allocations',
        },
      },
    }),
  ]);

  const name = user.displayName?.trim() || 'there';
  await sendEmail(
    user.email,
    `$${rounded.toFixed(2)} USDT returned to wallet — instant yield enabled`,
    layout(
      'Smart Invest update',
      `<p>Hi ${escapeHtml(name)},</p>
      <p><strong>$${rounded.toFixed(2)} USDT</strong> was moved from Smart Invest back to your platform wallet.</p>
      <p>Available wallet balance: <strong>$${nextAvailable.toFixed(2)} USDT</strong></p>
      <p>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></p>
      <p style="margin-top:20px;">Your account is also configured for <strong>immediate daily yield</strong> on Smart Invest — there is <strong>no 24-hour waiting period</strong> on new allocations.</p>
      <p style="color:#94a3b8;font-size:14px;">New capital starts earning on the next daily credit cycle (weekdays, Kampala time).</p>
      ${button(`${frontendUrl}/wallet`, 'View wallet')}
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `$${rounded.toFixed(2)} USDT moved from Smart Invest to wallet. Wallet: $${nextAvailable.toFixed(2)} USDT. Smart Invest: $${nextInvested.toFixed(2)} USDT. Instant yield enabled — no 24-hour hold on new allocations.`,
  );

  const afterUser = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: {
      instantWithdraw: true,
      instantWithdrawGrantedAt: true,
      instantWithdrawGrantedById: true,
      platformWallet: {
        select: { availableBalance: true, investorBalance: true },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        email: user.email,
        displayName: user.displayName,
        amountRedeemed: rounded,
        before,
        after: {
          walletBalance: Number(afterUser?.platformWallet?.availableBalance ?? 0),
          investmentBalance: Number(afterUser?.platformWallet?.investorBalance ?? 0),
          instantWithdraw: afterUser?.instantWithdraw ?? false,
          instantWithdrawGrantedAt:
            afterUser?.instantWithdrawGrantedAt?.toISOString() ?? null,
          instantWithdrawGrantedById: afterUser?.instantWithdrawGrantedById ?? null,
        },
        yieldHoldExempt: afterUser?.instantWithdraw === true,
        emailSent: true,
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
