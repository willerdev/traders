/**
 * One-off: credit $1,950 USDT to umoly90@gmail.com (Trade Guard) and move
 * the full amount into Smart Invest with no self-reinvest fee (admin /
 * allowCapitalAllocate path). Set 10% weekday yield. Email the user.
 *
 * Idempotent: skips if reference umoly90_smart_invest_1950_2026-09-24 exists.
 *
 * Usage: cd backend && npx tsx scripts/credit-umoly90-smart-invest-1950.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

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
const apiKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';

const EMAIL = 'umoly90@gmail.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const DEPOSIT_USDT = 1950;
const DAILY_YIELD_PERCENT = 10;
const REFERENCE = 'umoly90_smart_invest_1950_2026-09-24';
const DEPOSIT_REF = `${REFERENCE}_deposit`;
const ALLOCATE_REF = `${REFERENCE}_allocate`;
const SENT_PATH = resolve(__dirname, '.sent-umoly90-smart-invest-1950.json');

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

function snapshot(user: {
  id: string;
  email: string | null;
  displayName: string;
  investorActive: boolean;
  platformWallet: {
    availableBalance: unknown;
    investorBalance: unknown;
  } | null;
  investorSettings: {
    dailyYieldPercent: unknown;
    yieldPaused: boolean;
    paused: boolean;
    minBalanceExempt: boolean;
  } | null;
}) {
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    wallet: Number(user.platformWallet?.availableBalance ?? 0),
    invest: Number(user.platformWallet?.investorBalance ?? 0),
    yield: {
      dailyYieldPercent:
        user.investorSettings?.dailyYieldPercent != null
          ? Number(user.investorSettings.dailyYieldPercent)
          : null,
      yieldPaused: user.investorSettings?.yieldPaused ?? null,
      paused: user.investorSettings?.paused ?? null,
      minBalanceExempt: user.investorSettings?.minBalanceExempt ?? null,
    },
    investorActive: user.investorActive,
  };
}

async function main() {
  const probe = await prisma.user.findFirst({
    where: { email: 'nelysa2020@gmail.com' },
    select: { id: true },
  });
  if (!probe) {
    throw new Error('Wrong database (nelysa2020 missing) — abort, not Trade Guard');
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!user?.email) throw new Error(`User not found: ${EMAIL}`);
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }

  const userId = user.id;
  const before = snapshot(user);

  const existing = await prisma.walletTransaction.findFirst({
    where: {
      OR: [
        { referenceId: REFERENCE },
        { referenceId: DEPOSIT_REF },
        { referenceId: ALLOCATE_REF },
      ],
    },
  });
  if (existing) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'already_processed',
          referenceId: existing.referenceId,
          userId,
          wallet: before.wallet,
          invest: before.invest,
          yield: before.yield,
          emailSent: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const now = new Date();
  const name = user.displayName?.trim() || 'Umoly';
  const investedBefore = Number(user.platformWallet?.investorBalance ?? 0);
  const availableBefore = Number(user.platformWallet?.availableBalance ?? 0);
  const nextAvailable = Math.round(availableBefore * 100) / 100;
  const nextInvested = Math.round((investedBefore + DEPOSIT_USDT) * 100) / 100;
  const committedBefore = Number(
    user.investorSettings?.committedInvestmentAmount ?? 0,
  );
  const nextCommitted = Math.round((committedBefore + DEPOSIT_USDT) * 100) / 100;

  await prisma.$transaction(async (tx) => {
    await tx.platformWallet.upsert({
      where: { userId },
      create: {
        userId,
        availableBalance: 0,
        investorBalance: nextInvested,
      },
      update: {
        availableBalance: nextAvailable,
        investorBalance: nextInvested,
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId,
        amount: DEPOSIT_USDT,
        type: 'ADJUSTMENT',
        referenceId: DEPOSIT_REF,
        description: `Platform wallet deposit — $${DEPOSIT_USDT.toFixed(2)} USDT`,
        balanceAfter: Math.round((availableBefore + DEPOSIT_USDT) * 100) / 100,
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId,
        amount: -DEPOSIT_USDT,
        type: 'INVESTOR_ALLOCATE',
        referenceId: ALLOCATE_REF,
        description: `Moved to Smart Invest — $${DEPOSIT_USDT.toFixed(2)} USDT`,
        balanceAfter: nextAvailable,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        investorActive: true,
        investorEnrolledAt: user.investorEnrolledAt ?? now,
      },
    });

    await tx.investorSettings.upsert({
      where: { userId },
      create: {
        userId,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
        yieldPaused: false,
        paused: false,
        minBalanceExempt: true,
        committedInvestmentAmount: DEPOSIT_USDT,
      },
      update: {
        dailyYieldPercent: DAILY_YIELD_PERCENT,
        yieldPaused: false,
        paused: false,
        minBalanceExempt: true,
        committedInvestmentAmount: nextCommitted,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_TRANSFER',
        targetId: userId,
        metadata: {
          source: 'credit-umoly90-smart-invest-1950',
          email: EMAIL,
          deposit: DEPOSIT_USDT,
          feeAmount: 0,
          feePercent: 0,
          netInvested: DEPOSIT_USDT,
          direction: 'to_investment',
          allowCapitalAllocate: true,
          dailyYieldPercent: DAILY_YIELD_PERCENT,
          reference: REFERENCE,
        },
      },
    });
  });

  const afterUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!afterUser) throw new Error('User missing after credit');
  const after = snapshot(afterUser);

  const investUrl = `${frontendUrl.replace(/\/$/, '')}/invest`;
  const walletUrl = `${frontendUrl.replace(/\/$/, '')}/wallet`;
  const subject = `$${DEPOSIT_USDT.toFixed(2)} USDT credited and invested in Smart Invest`;
  const html = layout(
    'Smart Invest is ready',
    `<p>Hi ${escapeHtml(name)},</p>
    <p><strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong> has been credited to your Trade Guard platform wallet and moved in full to <strong>Smart Invest</strong>.</p>
    <ul style="line-height:1.7;padding-left:20px">
      <li>Amount credited: <strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong></li>
      <li>Amount invested: <strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong></li>
      <li>Smart Invest balance: <strong>$${after.invest.toFixed(2)} USDT</strong></li>
      <li>Platform wallet: <strong>$${after.wallet.toFixed(2)} USDT</strong></li>
      <li>Daily yield: <strong>${DAILY_YIELD_PERCENT}%</strong> on business days only (Monday–Friday, Africa/Kampala). Saturday and Sunday are not credited.</li>
    </ul>
    ${button(investUrl, 'Open Smart Invest')}
    <p><a href="${escapeHtml(walletUrl)}" style="color:#93c5fd;">View wallet</a></p>`,
  );
  const text = `Hi ${name},

$${DEPOSIT_USDT.toFixed(2)} USDT has been credited to your Trade Guard platform wallet and moved in full to Smart Invest.

Amount credited: $${DEPOSIT_USDT.toFixed(2)} USDT
Amount invested: $${DEPOSIT_USDT.toFixed(2)} USDT
Smart Invest balance: $${after.invest.toFixed(2)} USDT
Platform wallet: $${after.wallet.toFixed(2)} USDT
Daily yield: ${DAILY_YIELD_PERCENT}% on business days only (Monday–Friday, Africa/Kampala). Saturday and Sunday are not credited.

Smart Invest: ${investUrl}
Wallet: ${walletUrl}`;

  const emailSent = await sendEmail(user.email, subject, html, text);

  writeFileSync(
    SENT_PATH,
    JSON.stringify(
      {
        sentAt: new Date().toISOString(),
        userId,
        email: EMAIL,
        depositUsdt: DEPOSIT_USDT,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
        emailSent,
        before,
        after,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        userId,
        email: EMAIL,
        displayName: after.displayName,
        before,
        after,
        wallet: after.wallet,
        invest: after.invest,
        yield: after.yield,
        depositUsdt: DEPOSIT_USDT,
        feeUsdt: 0,
        netInvested: DEPOSIT_USDT,
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
