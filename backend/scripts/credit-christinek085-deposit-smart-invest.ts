/**
 * Admin one-off for KezC (christinek085@gmail.com):
 * - Deposit $550 USDT to platform wallet (ADJUSTMENT)
 * - Allocate full $550 to Smart Invest (admin fee waived — full amount invested)
 * - Enroll in Smart Invest if not already active
 * - Standard 24h yield hold (INVESTOR_ALLOCATE timestamp = now, NOT backdated)
 * - Email user (detailed breakdown) + admin confirmation
 *
 * Idempotent: skips if allocate reference already exists.
 *
 * Usage: cd backend && npx tsx scripts/credit-christinek085-deposit-smart-invest.ts
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

const USER_ID = 'cmrr0fjao02v9lb01phxfd58h';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'christinek085@gmail.com';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';

const DEPOSIT_USDT = 550;
const FEE_USDT = 0;
const NET_INVESTED = DEPOSIT_USDT - FEE_USDT;
const PLATFORM_DEFAULT_YIELD_PERCENT = 8;

const REFERENCE_PREFIX = 'christinek085_admin_deposit_smart_invest_2026-09-09';
const DEPOSIT_REF = `${REFERENCE_PREFIX}_deposit`;
const FEE_REF = `${REFERENCE_PREFIX}_fee`;
const ENROLL_REF = `${REFERENCE_PREFIX}_enroll`;
const ALLOCATE_REF = `${REFERENCE_PREFIX}_allocate`;

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

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }

  const settingsYield =
    user.investorSettings?.dailyYieldPercent != null
      ? Number(user.investorSettings.dailyYieldPercent)
      : null;
  const dailyYieldPercent = effectiveYieldPercent(settingsYield);
  const wasEnrolled = user.investorActive;

  const before = {
    walletBalance: Number(user.platformWallet?.availableBalance ?? 0),
    investmentBalance: Number(user.platformWallet?.investorBalance ?? 0),
    investorActive: user.investorActive,
    status: user.status,
    dailyYieldPercent: settingsYield,
  };

  const existingAllocate = await prisma.walletTransaction.findFirst({
    where: { referenceId: ALLOCATE_REF },
  });
  if (existingAllocate) {
    const fresh = await prisma.user.findUnique({
      where: { id: USER_ID },
      include: { platformWallet: true, investorSettings: true },
    });
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'already_processed',
          user: { id: USER_ID, email: EMAIL, displayName: fresh?.displayName },
          before,
          after: {
            walletBalance: Number(fresh?.platformWallet?.availableBalance ?? 0),
            investmentBalance: Number(fresh?.platformWallet?.investorBalance ?? 0),
            investorActive: fresh?.investorActive,
          },
          allocateCreatedAt: existingAllocate.createdAt.toISOString(),
        },
        null,
        2,
      ),
    );
    return;
  }

  const name = user.displayName?.trim() || 'there';
  const now = new Date();
  const yieldEligibleAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await prisma.platformWallet.upsert({
    where: { userId: USER_ID },
    create: { userId: USER_ID },
    update: {},
  });

  let wallet = await prisma.platformWallet.findUnique({ where: { userId: USER_ID } });
  let available = Number(wallet!.availableBalance);
  const investedBefore = Number(wallet!.investorBalance);

  available = Math.round((available + DEPOSIT_USDT) * 100) / 100;
  await prisma.$transaction([
    prisma.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: available },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: DEPOSIT_USDT,
        type: 'ADJUSTMENT',
        referenceId: DEPOSIT_REF,
        description: `Admin deposit — $${DEPOSIT_USDT.toFixed(2)} USDT`,
        balanceAfter: available,
      },
    }),
  ]);

  if (FEE_USDT > 0) {
    available = Math.round((available - FEE_USDT) * 100) / 100;
    await prisma.$transaction([
      prisma.platformWallet.update({
        where: { userId: USER_ID },
        data: { availableBalance: available },
      }),
      prisma.walletTransaction.create({
        data: {
          userId: USER_ID,
          amount: -FEE_USDT,
          type: 'INVESTOR_FEE',
          referenceId: FEE_REF,
          description: `Smart Invest investment fee — $${FEE_USDT.toFixed(2)} USDT (on $${DEPOSIT_USDT.toFixed(2)} admin deposit)`,
          balanceAfter: available,
        },
      }),
    ]);
  }

  if (available < NET_INVESTED) {
    throw new Error(`Need $${NET_INVESTED} to allocate, have $${available}`);
  }

  const nextAvailable = Math.round((available - NET_INVESTED) * 100) / 100;
  const nextInvested = Math.round((investedBefore + NET_INVESTED) * 100) / 100;

  const payment = await prisma.payment.create({
    data: {
      userId: USER_ID,
      amount: DEPOSIT_USDT,
      currency: 'USDT',
      network: 'WALLET',
      purpose: wasEnrolled ? 'investor_reinvest' : 'investor_enrollment',
      status: 'CONFIRMED',
      confirmedAt: now,
      gatewayId: ENROLL_REF,
      gatewayResponse: {
        paymentSource: 'wallet',
        investmentAmount: DEPOSIT_USDT,
        feeUsdt: FEE_USDT,
        netInvested: NET_INVESTED,
        adminId: ADMIN_ID,
        holdWaived: false,
        adminDeposit: true,
        feeWaived: FEE_USDT === 0,
      } as object,
    },
  });

  let allocateCreatedAt: Date | null = null;

  await prisma.$transaction(async (tx) => {
    if (!wasEnrolled) {
      await tx.user.update({
        where: { id: USER_ID },
        data: {
          status: 'ACTIVE',
          registrationPaid: true,
          investorActive: true,
          investorEnrolledAt: now,
        },
      });
      await tx.investorSettings.upsert({
        where: { userId: USER_ID },
        create: {
          userId: USER_ID,
          riskPercent: 2,
          committedInvestmentAmount: NET_INVESTED,
        },
        update: { committedInvestmentAmount: NET_INVESTED },
      });
    } else {
      await tx.investorSettings.upsert({
        where: { userId: USER_ID },
        create: {
          userId: USER_ID,
          riskPercent: 2,
          committedInvestmentAmount: NET_INVESTED,
        },
        update: {
          committedInvestmentAmount:
            Number(
              (
                await tx.investorSettings.findUnique({ where: { userId: USER_ID } })
              )?.committedInvestmentAmount ?? 0,
            ) + NET_INVESTED,
        },
      });
    }

    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: {
        availableBalance: nextAvailable,
        investorBalance: nextInvested,
      },
    });
    const allocateTx = await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -NET_INVESTED,
        type: 'INVESTOR_ALLOCATE',
        referenceId: ALLOCATE_REF,
        description: wasEnrolled
          ? `Admin allocation — $${NET_INVESTED.toFixed(2)} USDT to Smart Invest${FEE_USDT > 0 ? ` ($${FEE_USDT.toFixed(2)} fee on $${DEPOSIT_USDT.toFixed(2)} deposit)` : ' (fee waived)'}; standard 24h yield hold applies`
          : `Admin enrollment — $${NET_INVESTED.toFixed(2)} USDT invested${FEE_USDT > 0 ? ` ($${FEE_USDT.toFixed(2)} fee on $${DEPOSIT_USDT.toFixed(2)} deposit)` : ' (fee waived)'}; standard 24h yield hold applies`,
        balanceAfter: nextAvailable,
      },
    });
    allocateCreatedAt = allocateTx.createdAt;
    await tx.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_TRANSFER',
        targetId: USER_ID,
        metadata: {
          source: 'credit-christinek085-deposit-smart-invest',
          email: EMAIL,
          paymentId: payment.id,
          deposit: DEPOSIT_USDT,
          feeAmount: FEE_USDT,
          netInvested: NET_INVESTED,
          direction: 'to_investment',
          enrolled: !wasEnrolled,
          holdWaived: false,
          feeWaived: FEE_USDT === 0,
          dailyYieldPercent,
        },
      },
    });
  });

  const feeLine =
    FEE_USDT > 0
      ? `<li>Investment fee: <strong>$${FEE_USDT.toFixed(2)} USDT</strong></li>`
      : `<li>Investment fee: <strong>waived</strong> (full $${DEPOSIT_USDT.toFixed(2)} USDT invested)</li>`;
  const enrollmentNote = wasEnrolled
    ? ''
    : '<li>Smart Invest enrollment: <strong>activated</strong></li>\n      ';

  const userSubject = wasEnrolled
    ? `Admin deposit processed — $${NET_INVESTED.toFixed(2)} USDT invested in Smart Invest`
    : `Smart Invest activated — $${NET_INVESTED.toFixed(2)} USDT invested`;
  const userHtml = layout(
    wasEnrolled ? 'Admin deposit & Smart Invest allocation' : 'Admin deposit & Smart Invest enrollment',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>An administrator processed a deposit on your account. Here is the full breakdown:</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>Admin deposit: <strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong></li>
      ${feeLine}
      ${enrollmentNote}<li>Amount invested to Smart Invest: <strong>$${NET_INVESTED.toFixed(2)} USDT</strong></li>
      <li>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></li>
      <li>Platform wallet: <strong>$${nextAvailable.toFixed(2)} USDT</strong></li>
      <li>Daily yield rate: <strong>${dailyYieldPercent}%</strong></li>
    </ul>
    <p style="color:#94a3b8;font-size:14px;">This allocation has a standard <strong>24-hour yield hold</strong>. Daily yield credits begin after <strong>${escapeHtml(formatYieldEligibleAt(yieldEligibleAt))}</strong> (Kampala time). Credits run on weekdays.</p>
    ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
  );
  const userText = `Admin deposit $${DEPOSIT_USDT.toFixed(2)} USDT.${FEE_USDT > 0 ? ` Fee $${FEE_USDT.toFixed(2)}.` : ' Fee waived.'}${wasEnrolled ? '' : ' Smart Invest activated.'} Invested $${NET_INVESTED.toFixed(2)} to Smart Invest. Balance: $${nextInvested.toFixed(2)} invested, $${nextAvailable.toFixed(2)} wallet. Yield ${dailyYieldPercent}%. 24h hold applies — yield eligible after ${formatYieldEligibleAt(yieldEligibleAt)}.`;

  const userEmailSent = await sendEmail(EMAIL, userSubject, userHtml, userText);

  const adminSubject = `[Admin] KezC deposit — $${DEPOSIT_USDT} deposit, $${FEE_USDT} fee, $${NET_INVESTED} to Smart Invest`;
  const adminHtml = layout(
    'KezC admin deposit complete',
    `<p>Admin operation completed for <strong>${escapeHtml(EMAIL)}</strong>.</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>User: ${escapeHtml(name)} (${escapeHtml(EMAIL)})</li>
      <li>User ID: ${escapeHtml(USER_ID)}</li>
      <li>Deposit: <strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong></li>
      <li>Investment fee: <strong>${FEE_USDT > 0 ? `$${FEE_USDT.toFixed(2)} USDT` : 'waived (full amount invested)'}</strong></li>
      <li>Allocated to Smart Invest: <strong>$${NET_INVESTED.toFixed(2)} USDT</strong></li>
      <li>Enrollment: <strong>${wasEnrolled ? 'already active' : 'newly enrolled'}</strong></li>
      <li>Before — wallet: $${before.walletBalance.toFixed(2)}, Smart Invest: $${before.investmentBalance.toFixed(2)}, status: ${before.status}</li>
      <li>After — wallet: $${nextAvailable.toFixed(2)}, Smart Invest: $${nextInvested.toFixed(2)}</li>
      <li>Daily yield rate: <strong>${dailyYieldPercent}%</strong></li>
      <li>24h hold: <strong>active</strong> (INVESTOR_ALLOCATE at ${escapeHtml(formatYieldEligibleAt(now))})</li>
      <li>Yield eligible after: <strong>${escapeHtml(formatYieldEligibleAt(yieldEligibleAt))}</strong></li>
    </ul>`,
  );
  const adminText = `KezC (${EMAIL}): $${DEPOSIT_USDT} deposit, fee ${FEE_USDT > 0 ? `$${FEE_USDT}` : 'waived'}, $${NET_INVESTED} to Smart Invest. Enrolled: ${wasEnrolled ? 'already' : 'yes'}. Wallet $${before.walletBalance}→$${nextAvailable}, Invest $${before.investmentBalance}→$${nextInvested}. 24h hold active.`;

  const adminEmailSent = await sendEmail(
    ADMIN_EMAIL,
    adminSubject,
    adminHtml,
    adminText,
  );

  const afterUser = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true, investorSettings: true },
  });

  console.log(
    JSON.stringify(
      {
        user: {
          id: USER_ID,
          email: EMAIL,
          displayName: afterUser?.displayName,
        },
        before,
        after: {
          status: afterUser?.status,
          walletBalance: Number(afterUser?.platformWallet?.availableBalance ?? 0),
          investmentBalance: Number(afterUser?.platformWallet?.investorBalance ?? 0),
          investorActive: afterUser?.investorActive,
          dailyYieldPercent,
        },
        depositUsdt: DEPOSIT_USDT,
        feeUsdt: FEE_USDT,
        netInvested: NET_INVESTED,
        enrolled: !wasEnrolled,
        holdStatus: '24h hold active (INVESTOR_ALLOCATE not backdated)',
        allocateCreatedAt: allocateCreatedAt?.toISOString(),
        yieldEligibleAt: yieldEligibleAt.toISOString(),
        emailsSent: {
          user: { to: EMAIL, subject: userSubject, sent: userEmailSent },
          admin: { to: ADMIN_EMAIL, subject: adminSubject, sent: adminEmailSent },
        },
        paymentId: payment.id,
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
