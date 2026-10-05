/**
 * One-off: move full wallet balance → Smart Invest for mugerwas@gmail.com (Sammy).
 * Fee waived (0%), 24h yield hold waived via backdated INVESTOR_ALLOCATE tx.
 *
 * Usage: cd backend && npx tsx scripts/transfer-mugerwas-wallet-to-invest.ts
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

const USER_ID = 'cmsg0a74d069iku01m7skci5y';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'mugerwas@gmail.com';

const REFERENCE_PREFIX = 'mugerwas_admin_wallet_to_invest_2026-09-01';
const ALLOCATE_REF = `${REFERENCE_PREFIX}_allocate`;

const HOLD_BACKDATE_MS = 25 * 60 * 60 * 1000;

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
  const existing = await prisma.walletTransaction.findFirst({
    where: { referenceId: ALLOCATE_REF },
  });
  if (existing) {
    const user = await prisma.user.findUnique({
      where: { id: USER_ID },
      include: { platformWallet: true },
    });
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'already_processed',
          email: user?.email,
          walletBalance: Number(user?.platformWallet?.availableBalance ?? 0),
          investmentBalance: Number(user?.platformWallet?.investorBalance ?? 0),
        },
        null,
        2,
      ),
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }
  if (!user.investorActive) {
    throw new Error('User is not enrolled in Smart Invest — use enrollment script instead');
  }

  const wallet =
    user.platformWallet ??
    (await prisma.platformWallet.create({ data: { userId: USER_ID } }));
  const availableBefore = Number(wallet.availableBalance);
  const investedBefore = Number(wallet.investorBalance ?? 0);

  if (availableBefore <= 0) {
    throw new Error(`No wallet balance to transfer (available: $${availableBefore.toFixed(2)})`);
  }

  const rounded = Math.round(availableBefore * 100) / 100;
  const feePercent = 0;
  const feeAmount = 0;
  const netInvested = rounded;
  const nextAvailable = 0;
  const nextInvested = Math.round((investedBefore + netInvested) * 100) / 100;
  const backdatedAt = new Date(Date.now() - HOLD_BACKDATE_MS);
  const name = user.displayName?.trim() || 'there';

  const before = {
    walletBalance: availableBefore,
    investmentBalance: investedBefore,
    dailyYieldPercent:
      user.investorSettings?.dailyYieldPercent != null
        ? Number(user.investorSettings.dailyYieldPercent)
        : null,
  };

  await prisma.$transaction(async (tx) => {
    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: {
        availableBalance: nextAvailable,
        investorBalance: nextInvested,
      },
    });
    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -rounded,
        type: 'INVESTOR_ALLOCATE',
        referenceId: ALLOCATE_REF,
        description: `Admin allocation — $${rounded.toFixed(2)} USDT from wallet to Smart Invest (fee waived; 24h hold waived)`,
        balanceAfter: nextAvailable,
        createdAt: backdatedAt,
      },
    });
    await tx.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_TRANSFER',
        targetId: USER_ID,
        metadata: {
          source: 'transfer-mugerwas-wallet-to-invest',
          amount: rounded,
          direction: 'to_investment',
          feeAmount,
          feePercent,
          netInvested,
          holdWaived: true,
          holdWaiveMethod: 'backdated_allocate_tx',
        },
      },
    });
  });

  const emailSent = await sendEmail(
    user.email,
    `$${netInvested.toFixed(2)} USDT allocated to Smart Invest`,
    layout(
      'Wallet allocated to Smart Invest',
      `<p>Hi ${escapeHtml(name)},</p>
      <p><strong>$${rounded.toFixed(2)} USDT</strong> was moved from your platform wallet to <strong>Smart Invest</strong>.</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Amount invested: <strong>$${netInvested.toFixed(2)} USDT</strong> (no transfer fee)</li>
        <li>Platform wallet: <strong>$${nextAvailable.toFixed(2)} USDT</strong></li>
        <li>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></li>
        <li>Daily yield rate: <strong>${before.dailyYieldPercent ?? 8}%</strong></li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">This allocation is eligible for daily yield immediately — the 24-hour hold has been waived. Credits run on weekdays (Kampala time).</p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `$${rounded.toFixed(2)} USDT moved to Smart Invest (fee waived, 24h hold waived). Investment balance: $${nextInvested.toFixed(2)} USDT.`,
  );

  const afterWallet = await prisma.platformWallet.findUnique({ where: { userId: USER_ID } });

  console.log(
    JSON.stringify(
      {
        user: {
          id: USER_ID,
          email: user.email,
          displayName: user.displayName,
        },
        before,
        after: {
          walletBalance: Number(afterWallet?.availableBalance ?? 0),
          investmentBalance: Number(afterWallet?.investorBalance ?? 0),
        },
        amountMoved: rounded,
        feePercent,
        feeWaived: feeAmount,
        netInvested,
        holdStatus: '24h hold waived (backdated INVESTOR_ALLOCATE tx by 25h)',
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
