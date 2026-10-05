/**
 * Enroll tuyizeremma1@gmail.com (Emma) in Smart Invest:
 * - Move full wallet balance → Smart Invest (fee waived)
 * - Set 12% daily yield
 * - Waive 24h hold (backdated INVESTOR_ALLOCATE + instantWithdraw)
 * - Schedule platform yield delivery ~3 hours from script run (Kampala time)
 * - Email user + admin confirmation
 *
 * Idempotent: skips if allocate reference already exists.
 *
 * Usage: cd backend && npx tsx scripts/enroll-tuyizeremma-smart-invest-12pct.ts
 *
 * Env overrides (optional):
 *   YIELD_OFFSET_HOURS=3
 *   ADMIN_EMAIL=willeratmit12@gmail.com
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  formatKampalaTime,
  kampalaCalendarDate,
  kampalaHourMinute,
} from '../src/common/kampala-time.util';

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

const USER_ID = 'cmtizuudx0001i66bzbup1kmm';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'tuyizeremma1@gmail.com';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const DISPLAY_NAME = 'Emma';
const DAILY_YIELD_PERCENT = 12;
const YIELD_OFFSET_HOURS = Number(process.env.YIELD_OFFSET_HOURS ?? 3);

const REFERENCE_PREFIX = 'tuyizeremma_admin_smart_invest_12pct_2026-09-02';
const ENROLL_REF = `${REFERENCE_PREFIX}_enroll`;
const ALLOCATE_REF = `${REFERENCE_PREFIX}_allocate`;
const YIELD_SCHEDULE_REF = `${REFERENCE_PREFIX}_yield_schedule`;

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

function formatKampalaDateTime(date: Date) {
  return date.toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function computeYieldSchedule(now: Date) {
  const deliveryAt = new Date(now.getTime() + YIELD_OFFSET_HOURS * 60 * 60 * 1000);
  const scheduleDate = kampalaCalendarDate(deliveryAt);
  const { hour, minute } = kampalaHourMinute(deliveryAt);
  const scheduleMinute = hour * 60 + minute;
  return {
    deliveryAt,
    scheduleDate,
    scheduleMinute,
    kampalaLabel: formatKampalaDateTime(deliveryAt),
    utcLabel: deliveryAt.toISOString(),
    timeLabel: formatKampalaTime(hour, minute),
  };
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
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
  const now = new Date();
  const yieldSchedule = computeYieldSchedule(now);

  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }

  const before = {
    walletBalance: Number(user.platformWallet?.availableBalance ?? 0),
    investmentBalance: Number(user.platformWallet?.investorBalance ?? 0),
    investorActive: user.investorActive,
    dailyYieldPercent:
      user.investorSettings?.dailyYieldPercent != null
        ? Number(user.investorSettings.dailyYieldPercent)
        : null,
    committedInvestmentAmount:
      user.investorSettings?.committedInvestmentAmount != null
        ? Number(user.investorSettings.committedInvestmentAmount)
        : null,
    minBalanceExempt: user.investorSettings?.minBalanceExempt ?? false,
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
          email: EMAIL,
          before,
          after: {
            walletBalance: Number(fresh?.platformWallet?.availableBalance ?? 0),
            investmentBalance: Number(fresh?.platformWallet?.investorBalance ?? 0),
            investorActive: fresh?.investorActive,
            dailyYieldPercent:
              fresh?.investorSettings?.dailyYieldPercent != null
                ? Number(fresh.investorSettings.dailyYieldPercent)
                : null,
          },
          yieldSchedule: {
            deliveryAtKampala: yieldSchedule.kampalaLabel,
            deliveryAtUtc: yieldSchedule.utcLabel,
            creditScript: 'credit-tuyizeremma-scheduled-yield.ts',
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const available = Number(user.platformWallet?.availableBalance ?? 0);
  if (available <= 0) {
    throw new Error(
      `No wallet funds to allocate (available: $${available.toFixed(2)}). Admin deposit required first.`,
    );
  }

  const rounded = Math.round(available * 100) / 100;
  const feePercent = 0;
  const feeAmount = 0;
  const netInvested = rounded;
  const investedBefore = Number(user.platformWallet?.investorBalance ?? 0);
  const nextAvailable = 0;
  const nextInvested = Math.round((investedBefore + netInvested) * 100) / 100;
  const backdatedAt = new Date(Date.now() - HOLD_BACKDATE_MS);
  const name = user.displayName?.trim() || DISPLAY_NAME;
  const wasEnrolled = user.investorActive;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: USER_ID },
      data: {
        investorActive: true,
        investorEnrolledAt: user.investorEnrolledAt ?? now,
        instantWithdraw: true,
        instantWithdrawGrantedAt: user.instantWithdrawGrantedAt ?? now,
        instantWithdrawGrantedById: user.instantWithdrawGrantedById ?? ADMIN_ID,
      },
    });

    await tx.investorSettings.upsert({
      where: { userId: USER_ID },
      create: {
        userId: USER_ID,
        riskPercent: 2,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
        committedInvestmentAmount: netInvested,
        minBalanceExempt: true,
      },
      update: {
        dailyYieldPercent: DAILY_YIELD_PERCENT,
        committedInvestmentAmount: netInvested,
        minBalanceExempt: true,
      },
    });

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
        description: `Admin enrollment — $${netInvested.toFixed(2)} USDT from wallet to Smart Invest (${DAILY_YIELD_PERCENT}% daily; fee waived; 24h hold waived)`,
        balanceAfter: nextAvailable,
        createdAt: backdatedAt,
      },
    });

    if (!wasEnrolled) {
      await tx.payment.create({
        data: {
          userId: USER_ID,
          amount: rounded,
          currency: 'USDT',
          network: 'WALLET',
          purpose: 'investor_enrollment',
          status: 'CONFIRMED',
          confirmedAt: now,
          gatewayId: ENROLL_REF,
          gatewayResponse: {
            paymentSource: 'wallet',
            investmentAmount: rounded,
            feeUsdt: feeAmount,
            feePercent,
            netInvested,
            adminId: ADMIN_ID,
            holdWaived: true,
            dailyYieldPercent: DAILY_YIELD_PERCENT,
          } as object,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: wasEnrolled ? 'INVESTOR_TRANSFER' : 'INVESTOR_ENROLL',
        targetId: USER_ID,
        metadata: {
          source: 'enroll-tuyizeremma-smart-invest-12pct',
          email: EMAIL,
          amount: rounded,
          feeAmount,
          feePercent,
          netInvested,
          dailyYieldPercent: DAILY_YIELD_PERCENT,
          direction: 'to_investment',
          holdWaived: true,
          holdWaiveMethod: 'backdated_allocate_tx_and_instant_withdraw',
          yieldSchedule: {
            referenceId: YIELD_SCHEDULE_REF,
            offsetHours: YIELD_OFFSET_HOURS,
            deliveryAtUtc: yieldSchedule.utcLabel,
            deliveryAtKampala: yieldSchedule.kampalaLabel,
            scheduleDate: yieldSchedule.scheduleDate.toISOString(),
            scheduleMinute: yieldSchedule.scheduleMinute,
            scheduleTimeKampala: yieldSchedule.timeLabel,
          },
        },
      },
    });
  });

  const expectedYield =
    Math.round(((netInvested * DAILY_YIELD_PERCENT) / 100) * 100) / 100;

  const userSubject = `Smart Invest activated — $${netInvested.toFixed(2)} USDT at ${DAILY_YIELD_PERCENT}% daily yield`;
  const userHtml = layout(
    'Smart Invest activated',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>Your platform wallet balance of <strong>$${rounded.toFixed(2)} USDT</strong> has been allocated to <strong>Smart Invest</strong>.</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>Amount invested: <strong>$${netInvested.toFixed(2)} USDT</strong> (no enrollment fee)</li>
      <li>Daily yield rate: <strong>${DAILY_YIELD_PERCENT}%</strong></li>
      <li>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></li>
      <li>Platform wallet: <strong>$${nextAvailable.toFixed(2)} USDT</strong></li>
    </ul>
    <p style="margin:16px 0;padding:14px;background:#0f172a;border-radius:8px;border:1px solid #334155;">
      Your first daily yield credit is scheduled for approximately
      <strong>${escapeHtml(yieldSchedule.kampalaLabel)} EAT</strong>
      (~$${expectedYield.toFixed(2)} USDT at ${DAILY_YIELD_PERCENT}% on your invested balance).
    </p>
    <p style="color:#94a3b8;font-size:14px;">Your allocation is eligible for yield immediately — the 24-hour hold has been waived. Weekday credits run automatically via the platform schedule (Africa/Kampala).</p>
    ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
  );
  const userText = `Hi ${name}, $${rounded.toFixed(2)} USDT moved to Smart Invest at ${DAILY_YIELD_PERCENT}% daily yield. Invested: $${nextInvested.toFixed(2)} USDT. First yield ~${yieldSchedule.kampalaLabel} EAT (~$${expectedYield.toFixed(2)}). ${frontendUrl}/invest`;

  const userEmailSent = await sendEmail(EMAIL, userSubject, userHtml, userText);

  const adminSubject = `[Admin] Emma Smart Invest enrolled — $${netInvested.toFixed(2)} USDT @ ${DAILY_YIELD_PERCENT}%, yield at ${yieldSchedule.timeLabel} EAT`;
  const adminHtml = layout(
    'Emma Smart Invest enrollment complete',
    `<p>Admin operation completed for <strong>${escapeHtml(EMAIL)}</strong>.</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>User: ${escapeHtml(name)} (${escapeHtml(EMAIL)})</li>
      <li>Wallet → Smart Invest: <strong>$${netInvested.toFixed(2)} USDT</strong> (fee waived)</li>
      <li>Yield rate: <strong>${DAILY_YIELD_PERCENT}%</strong> daily</li>
      <li>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></li>
      <li>24h hold: <strong>waived</strong> (backdated allocate + instant withdraw)</li>
      <li>First yield delivery: <strong>${escapeHtml(yieldSchedule.kampalaLabel)} EAT</strong> (${escapeHtml(yieldSchedule.utcLabel)})</li>
      <li>Expected first credit: ~$${expectedYield.toFixed(2)} USDT</li>
    </ul>
    <p style="color:#94a3b8;font-size:13px;">Run <code>credit-tuyizeremma-scheduled-yield.ts</code> at the scheduled time (or via <code>at now + 3 hours</code>) to credit yield.</p>`,
  );
  const adminText = `Emma (${EMAIL}) enrolled: $${netInvested.toFixed(2)} USDT @ ${DAILY_YIELD_PERCENT}%. First yield ${yieldSchedule.kampalaLabel} EAT (~$${expectedYield.toFixed(2)}).`;

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
          investorActive: afterUser?.investorActive,
          walletBalance: Number(afterUser?.platformWallet?.availableBalance ?? 0),
          investmentBalance: Number(afterUser?.platformWallet?.investorBalance ?? 0),
          dailyYieldPercent: Number(
            afterUser?.investorSettings?.dailyYieldPercent ?? DAILY_YIELD_PERCENT,
          ),
          minBalanceExempt: afterUser?.investorSettings?.minBalanceExempt,
        },
        amountMoved: rounded,
        feePercent,
        feeWaived: feeAmount,
        netInvested,
        dailyYieldPercent: DAILY_YIELD_PERCENT,
        expectedFirstYield: expectedYield,
        holdStatus:
          '24h hold waived (backdated INVESTOR_ALLOCATE + instantWithdraw whitelist)',
        yieldSchedule: {
          offsetHours: YIELD_OFFSET_HOURS,
          deliveryAtKampala: yieldSchedule.kampalaLabel,
          deliveryAtUtc: yieldSchedule.utcLabel,
          scheduleTimeKampala: yieldSchedule.timeLabel,
          creditScript: 'backend/scripts/credit-tuyizeremma-scheduled-yield.ts',
          mechanism:
            'Audit-log scheduled delivery + companion credit script (PlatformConfig yield schedule columns not yet in prod DB)',
          scheduleCommand: `echo "cd $(pwd) && npx tsx scripts/credit-tuyizeremma-scheduled-yield.ts" | at now + ${YIELD_OFFSET_HOURS} hours`,
        },
        emailsSent: {
          user: { to: EMAIL, subject: userSubject, sent: userEmailSent },
          admin: { to: ADMIN_EMAIL, subject: adminSubject, sent: adminEmailSent },
        },
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
