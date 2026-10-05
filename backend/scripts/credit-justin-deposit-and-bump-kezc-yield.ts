/**
 * Admin one-off:
 * 1) Justin (ndayambajejustin2018@gmail.com) — $1000 deposit + Smart Invest (fee waived), emails per step
 * 2) KezC (christinek085@gmail.com) — +2% daily yield on current rate, notify user
 *
 * Usage: cd backend && npx tsx scripts/credit-justin-deposit-and-bump-kezc-yield.ts
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
  'Trade Guard <info@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';

const JUSTIN_ID = 'cmtueu02n3rkdi601cphm8mj4';
const JUSTIN_EMAIL = 'ndayambajejustin2018@gmail.com';
const KEZC_ID = 'cmrr0fjao02v9lb01phxfd58h';
const KEZC_EMAIL = 'christinek085@gmail.com';

const DEPOSIT_USDT = 1000;
const FEE_USDT = 0;
const NET_INVESTED = DEPOSIT_USDT - FEE_USDT;
const PLATFORM_DEFAULT_YIELD_PERCENT = 8;
const YIELD_BUMP_PERCENT = 2;

const JUSTIN_REF_PREFIX = 'justin_admin_deposit_smart_invest_2026-09-10';
const JUSTIN_DEPOSIT_REF = `${JUSTIN_REF_PREFIX}_deposit`;
const JUSTIN_ENROLL_REF = `${JUSTIN_REF_PREFIX}_enroll`;
const JUSTIN_ALLOCATE_REF = `${JUSTIN_REF_PREFIX}_allocate`;
const KEZC_YIELD_REF = 'kezc_daily_yield_plus_2_2026-09-10';

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

function formatYieldEligibleAt(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
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

function effectiveYieldPercent(settingsYield: number | null): number {
  return settingsYield ?? PLATFORM_DEFAULT_YIELD_PERCENT;
}

async function processJustin() {
  const user = await prisma.user.findUnique({
    where: { id: JUSTIN_ID },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!user?.email) throw new Error('Justin not found');
  if (user.email.toLowerCase() !== JUSTIN_EMAIL) {
    throw new Error(`Justin email mismatch: ${user.email}`);
  }

  const existingAllocate = await prisma.walletTransaction.findFirst({
    where: { referenceId: JUSTIN_ALLOCATE_REF },
  });
  if (existingAllocate) {
    return {
      skipped: true,
      reason: 'justin_already_processed',
      allocateCreatedAt: existingAllocate.createdAt.toISOString(),
    };
  }

  const name = user.displayName?.trim() || 'Justin';
  const wasEnrolled = user.investorActive;
  const settingsYield =
    user.investorSettings?.dailyYieldPercent != null
      ? Number(user.investorSettings.dailyYieldPercent)
      : null;
  const dailyYieldPercent = effectiveYieldPercent(settingsYield);
  const now = new Date();
  const yieldEligibleAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await prisma.platformWallet.upsert({
    where: { userId: JUSTIN_ID },
    create: { userId: JUSTIN_ID },
    update: {},
  });

  let wallet = await prisma.platformWallet.findUnique({
    where: { userId: JUSTIN_ID },
  });
  let available = Number(wallet!.availableBalance);
  const investedBefore = Number(wallet!.investorBalance);

  available = Math.round((available + DEPOSIT_USDT) * 100) / 100;
  await prisma.$transaction([
    prisma.platformWallet.update({
      where: { userId: JUSTIN_ID },
      data: { availableBalance: available },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: JUSTIN_ID,
        amount: DEPOSIT_USDT,
        type: 'ADJUSTMENT',
        referenceId: JUSTIN_DEPOSIT_REF,
        description: `Admin deposit — $${DEPOSIT_USDT.toFixed(2)} USDT`,
        balanceAfter: available,
      },
    }),
  ]);

  const depositEmailSent = await sendEmail(
    JUSTIN_EMAIL,
    `Wallet deposit — $${DEPOSIT_USDT.toFixed(2)} USDT credited`,
    layout(
      'Wallet deposit credited',
      `<p>Hi ${escapeHtml(name)},</p>
      <p><strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong> has been credited to your platform wallet by an administrator.</p>
      <p>Current wallet balance: <strong>$${available.toFixed(2)} USDT</strong></p>
      ${button(`${frontendUrl}/wallet`, 'View wallet')}`,
    ),
    `Hi ${name}, $${DEPOSIT_USDT.toFixed(2)} USDT was credited to your wallet. Balance: $${available.toFixed(2)} USDT.`,
  );

  if (!wasEnrolled) {
    await prisma.user.update({
      where: { id: JUSTIN_ID },
      data: {
        status: 'ACTIVE',
        registrationPaid: true,
        investorActive: true,
        investorEnrolledAt: now,
      },
    });
    await prisma.investorSettings.upsert({
      where: { userId: JUSTIN_ID },
      create: {
        userId: JUSTIN_ID,
        riskPercent: 2,
        committedInvestmentAmount: NET_INVESTED,
      },
      update: { committedInvestmentAmount: NET_INVESTED },
    });

    await sendEmail(
      JUSTIN_EMAIL,
      'Smart Invest activated on your account',
      layout(
        'Smart Invest activated',
        `<p>Hi ${escapeHtml(name)},</p>
        <p>Your account has been enrolled in <strong>Smart Invest</strong>.</p>
        <p>Daily yield rate: <strong>${dailyYieldPercent}%</strong> (weekdays, Kampala time)</p>
        ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
      ),
      `Hi ${name}, Smart Invest is now active on your account at ${dailyYieldPercent}% daily yield.`,
    );
  }

  const nextAvailable = Math.round((available - NET_INVESTED) * 100) / 100;
  const nextInvested = Math.round((investedBefore + NET_INVESTED) * 100) / 100;

  await prisma.payment.create({
    data: {
      userId: JUSTIN_ID,
      amount: DEPOSIT_USDT,
      currency: 'USDT',
      network: 'WALLET',
      purpose: wasEnrolled ? 'investor_reinvest' : 'investor_enrollment',
      status: 'CONFIRMED',
      confirmedAt: now,
      gatewayId: JUSTIN_ENROLL_REF,
      gatewayResponse: {
        paymentSource: 'wallet',
        investmentAmount: DEPOSIT_USDT,
        feeUsdt: FEE_USDT,
        netInvested: NET_INVESTED,
        adminId: ADMIN_ID,
        adminDeposit: true,
        feeWaived: true,
      } as object,
    },
  });

  await prisma.$transaction(async (tx) => {
    if (wasEnrolled) {
      await tx.investorSettings.upsert({
        where: { userId: JUSTIN_ID },
        create: {
          userId: JUSTIN_ID,
          riskPercent: 2,
          committedInvestmentAmount: NET_INVESTED,
        },
        update: {
          committedInvestmentAmount:
            Number(
              (
                await tx.investorSettings.findUnique({
                  where: { userId: JUSTIN_ID },
                })
              )?.committedInvestmentAmount ?? 0,
            ) + NET_INVESTED,
        },
      });
    }

    await tx.platformWallet.update({
      where: { userId: JUSTIN_ID },
      data: {
        availableBalance: nextAvailable,
        investorBalance: nextInvested,
      },
    });
    await tx.walletTransaction.create({
      data: {
        userId: JUSTIN_ID,
        amount: -NET_INVESTED,
        type: 'INVESTOR_ALLOCATE',
        referenceId: JUSTIN_ALLOCATE_REF,
        description: wasEnrolled
          ? `Admin allocation — $${NET_INVESTED.toFixed(2)} USDT to Smart Invest (fee waived); standard 24h yield hold applies`
          : `Admin enrollment — $${NET_INVESTED.toFixed(2)} USDT invested (fee waived); standard 24h yield hold applies`,
        balanceAfter: nextAvailable,
      },
    });
    await tx.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_TRANSFER',
        targetId: JUSTIN_ID,
        metadata: {
          source: 'credit-justin-deposit-and-bump-kezc-yield',
          email: JUSTIN_EMAIL,
          deposit: DEPOSIT_USDT,
          feeAmount: FEE_USDT,
          netInvested: NET_INVESTED,
          feeWaived: true,
          enrolled: !wasEnrolled,
        },
      },
    });
  });

  const investEmailSent = await sendEmail(
    JUSTIN_EMAIL,
    `Smart Invest — $${NET_INVESTED.toFixed(2)} USDT invested`,
    layout(
      'Funds allocated to Smart Invest',
      `<p>Hi ${escapeHtml(name)},</p>
      <p><strong>$${NET_INVESTED.toFixed(2)} USDT</strong> has been moved from your wallet into Smart Invest.</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Investment fee: <strong>waived</strong></li>
        <li>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></li>
        <li>Platform wallet: <strong>$${nextAvailable.toFixed(2)} USDT</strong></li>
        <li>Daily yield rate: <strong>${dailyYieldPercent}%</strong></li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">Standard <strong>24-hour yield hold</strong> applies. Daily yield credits begin after <strong>${escapeHtml(formatYieldEligibleAt(yieldEligibleAt))}</strong> (Kampala time), on weekdays.</p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `$${NET_INVESTED.toFixed(2)} USDT allocated to Smart Invest. Balance: $${nextInvested.toFixed(2)} invested, $${nextAvailable.toFixed(2)} wallet. Fee waived. Yield eligible after ${formatYieldEligibleAt(yieldEligibleAt)}.`,
  );

  await sendEmail(
    ADMIN_EMAIL,
    `[Admin] Justin — $${DEPOSIT_USDT} deposit + Smart Invest`,
    layout(
      'Justin admin deposit complete',
      `<p>Completed for <strong>${escapeHtml(JUSTIN_EMAIL)}</strong>.</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Deposit: $${DEPOSIT_USDT.toFixed(2)} USDT</li>
        <li>Fee: waived</li>
        <li>Invested: $${NET_INVESTED.toFixed(2)} USDT</li>
        <li>Smart Invest balance: $${nextInvested.toFixed(2)} USDT</li>
        <li>Enrollment: ${wasEnrolled ? 'already active' : 'newly activated'}</li>
        <li>User emails sent: deposit, ${wasEnrolled ? '' : 'enrollment, '}investment</li>
      </ul>`,
    ),
    `Justin: $${DEPOSIT_USDT} deposit, $${NET_INVESTED} to Smart Invest, fee waived.`,
  );

  return {
    skipped: false,
    justin: {
      depositUsdt: DEPOSIT_USDT,
      netInvested: NET_INVESTED,
      walletBalance: nextAvailable,
      investorBalance: nextInvested,
      enrolled: !wasEnrolled,
      emailsSent: {
        deposit: depositEmailSent,
        enrollment: !wasEnrolled,
        investment: investEmailSent,
      },
    },
  };
}

async function processKezcYieldBump() {
  const existing = await prisma.auditLog.findFirst({
    where: {
      targetId: KEZC_ID,
      action: 'INVESTOR_YIELD_RATE_UPDATE',
      metadata: { path: ['referenceId'], equals: KEZC_YIELD_REF },
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: KEZC_ID },
    include: { investorSettings: true, platformWallet: true },
  });
  if (!user?.email) throw new Error('KezC not found');
  if (user.email.toLowerCase() !== KEZC_EMAIL) {
    throw new Error(`KezC email mismatch: ${user.email}`);
  }

  const beforeYield =
    user.investorSettings?.dailyYieldPercent != null
      ? Number(user.investorSettings.dailyYieldPercent)
      : PLATFORM_DEFAULT_YIELD_PERCENT;
  const afterYield = beforeYield + YIELD_BUMP_PERCENT;

  if (existing) {
    return {
      skipped: true,
      reason: 'kezc_yield_already_bumped',
      beforeYield,
      afterYield:
        user.investorSettings?.dailyYieldPercent != null
          ? Number(user.investorSettings.dailyYieldPercent)
          : afterYield,
    };
  }

  await prisma.investorSettings.upsert({
    where: { userId: KEZC_ID },
    create: {
      userId: KEZC_ID,
      dailyYieldPercent: afterYield,
      riskPercent: 2,
    },
    update: { dailyYieldPercent: afterYield },
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'INVESTOR_YIELD_RATE_UPDATE',
      targetId: KEZC_ID,
      metadata: {
        referenceId: KEZC_YIELD_REF,
        email: KEZC_EMAIL,
        beforeYield,
        afterYield,
        bumpPercent: YIELD_BUMP_PERCENT,
      },
    },
  });

  const name = user.displayName?.trim() || 'there';
  const invested = Number(user.platformWallet?.investorBalance ?? 0);

  await sendEmail(
    KEZC_EMAIL,
    `Smart Invest daily yield updated — now ${afterYield}%`,
    layout(
      'Daily yield rate increased',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>Your Smart Invest daily yield rate has been updated:</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Previous rate: <strong>${beforeYield}%</strong></li>
        <li>New rate: <strong>${afterYield}%</strong> (+${YIELD_BUMP_PERCENT}%)</li>
        <li>Smart Invest balance: <strong>$${invested.toFixed(2)} USDT</strong></li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">The new rate applies to the next weekday yield credit (Kampala time).</p>
      ${button(`${frontendUrl}/invest`, 'View Smart Invest')}`,
    ),
    `Hi ${name}, your Smart Invest daily yield increased from ${beforeYield}% to ${afterYield}% (+${YIELD_BUMP_PERCENT}%). Balance: $${invested.toFixed(2)} USDT.`,
  );

  await sendEmail(
    ADMIN_EMAIL,
    `[Admin] KezC yield ${beforeYield}% → ${afterYield}%`,
    layout(
      'KezC yield bump',
      `<p><strong>${escapeHtml(KEZC_EMAIL)}</strong> daily yield updated from <strong>${beforeYield}%</strong> to <strong>${afterYield}%</strong> (+${YIELD_BUMP_PERCENT}%).</p>`,
    ),
    `KezC yield: ${beforeYield}% → ${afterYield}%`,
  );

  return {
    skipped: false,
    kezc: { beforeYield, afterYield, bumpPercent: YIELD_BUMP_PERCENT },
  };
}

async function main() {
  const justin = await processJustin();
  const kezc = await processKezcYieldBump();
  console.log(JSON.stringify({ justin, kezc }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
