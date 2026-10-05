/**
 * Admin one-off: Murekatete (mtetedyna250@gmail.com)
 * - Set explicit 8% daily yield (override VIP 10% default; VIP perks remain)
 * - Claw back excess 2% earned on 10% yield credits
 * - Email user + admin copy
 *
 * Idempotent: skips if clawback reference exists; email marker unless FORCE=1.
 *
 * Usage: cd backend && npx tsx scripts/adjust-murekatete-yield-8-clawback.ts
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

const USER_ID = 'cmtqbl9kn0jfrin01wz7qecpv';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'mtetedyna250@gmail.com';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';

const PREVIOUS_EFFECTIVE_YIELD = 10;
const NEW_DAILY_YIELD_PERCENT = 8;
const YIELD_DIFFERENTIAL = PREVIOUS_EFFECTIVE_YIELD - NEW_DAILY_YIELD_PERCENT;

const CLAWBACK_REF = 'murekatete_vip10_to_8_yield_clawback_2026-09-11';
const AUDIT_REF = 'murekatete_yield_8_clawback_2026-09-11';
const markerPath = resolve(__dirname, '.sent-murekatete-yield-8-clawback.json');
const force = process.env.FORCE === '1';

type Marker = {
  userEmail?: { sentAt: string; subject: string };
  adminEmail?: { sentAt: string; subject: string };
};

function readMarker(): Marker {
  if (!existsSync(markerPath)) return {};
  try {
    return JSON.parse(readFileSync(markerPath, 'utf8')) as Marker;
  } catch {
    return {};
  }
}

function writeMarker(marker: Marker) {
  writeFileSync(markerPath, JSON.stringify(marker, null, 2));
}

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

function round2(n: number) {
  return Math.round(n * 100) / 100;
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

type ClawbackLine = {
  creditDate: string;
  creditedAmount: number;
  yieldPercent: number;
  extraAmount: number;
};

function computeClawback(credits: {
  amount: unknown;
  yieldPercent: unknown;
  creditDate: Date;
}[]): { lines: ClawbackLine[]; totalExtra: number } {
  const lines: ClawbackLine[] = [];
  let totalExtra = 0;

  for (const credit of credits) {
    const yieldPercent = Number(credit.yieldPercent);
    if (yieldPercent !== PREVIOUS_EFFECTIVE_YIELD) continue;

    const creditedAmount = Number(credit.amount);
    const extraAmount = round2(
      creditedAmount * (YIELD_DIFFERENTIAL / PREVIOUS_EFFECTIVE_YIELD),
    );
    if (extraAmount <= 0) continue;

    lines.push({
      creditDate: credit.creditDate.toISOString().slice(0, 10),
      creditedAmount,
      yieldPercent,
      extraAmount,
    });
    totalExtra = round2(totalExtra + extraAmount);
  }

  return { lines, totalExtra };
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true, investorSettings: true },
  });
  if (!user?.email) throw new Error('User not found');
  if (user.email.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: expected ${EMAIL}, got ${user.email}`);
  }

  const credits = await prisma.investorDailyCredit.findMany({
    where: { userId: USER_ID },
    orderBy: { creditDate: 'asc' },
  });

  const { lines: clawbackLines, totalExtra: computedClawback } =
    computeClawback(credits);

  const beforeYield =
    user.investorSettings?.dailyYieldPercent != null
      ? Number(user.investorSettings.dailyYieldPercent)
      : PREVIOUS_EFFECTIVE_YIELD;

  const beforeWallet = Number(user.platformWallet?.availableBalance ?? 0);
  const beforeInvest = Number(user.platformWallet?.investorBalance ?? 0);

  const existingClawback = await prisma.walletTransaction.findFirst({
    where: { userId: USER_ID, referenceId: CLAWBACK_REF },
  });

  const existingAudit = await prisma.auditLog.findFirst({
    where: {
      targetId: USER_ID,
      action: 'INVESTOR_YIELD_RATE_UPDATE',
      metadata: { path: ['referenceId'], equals: AUDIT_REF },
    },
  });

  let clawbackApplied = 0;
  let clawbackCapped = false;
  let afterWallet = beforeWallet;

  if (existingClawback) {
    clawbackApplied = Math.abs(Number(existingClawback.amount));
    afterWallet = Number(existingClawback.balanceAfter);
  } else {
    const available = beforeWallet;
    clawbackApplied = round2(Math.min(computedClawback, available));
    clawbackCapped = clawbackApplied < computedClawback;
    afterWallet = round2(available - clawbackApplied);

    if (clawbackApplied > 0) {
      await prisma.$transaction([
        prisma.platformWallet.update({
          where: { userId: USER_ID },
          data: { availableBalance: afterWallet },
        }),
        prisma.walletTransaction.create({
          data: {
            userId: USER_ID,
            amount: -clawbackApplied,
            type: 'ADJUSTMENT',
            referenceId: CLAWBACK_REF,
            description: `Smart Invest yield adjustment — reversed $${clawbackApplied.toFixed(2)} USDT excess from ${PREVIOUS_EFFECTIVE_YIELD}% vs ${NEW_DAILY_YIELD_PERCENT}% differential (${clawbackLines.length} weekday credits)`,
            balanceAfter: afterWallet,
          },
        }),
      ]);
    }
  }

  const settings = await prisma.investorSettings.upsert({
    where: { userId: USER_ID },
    create: {
      userId: USER_ID,
      dailyYieldPercent: NEW_DAILY_YIELD_PERCENT,
      riskPercent: 2,
    },
    update: { dailyYieldPercent: NEW_DAILY_YIELD_PERCENT },
  });

  if (!existingAudit) {
    await prisma.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_YIELD_RATE_UPDATE',
        targetId: USER_ID,
        metadata: {
          referenceId: AUDIT_REF,
          email: EMAIL,
          beforeEffectiveYield: beforeYield,
          afterDailyYieldPercent: NEW_DAILY_YIELD_PERCENT,
          vipActive: user.investorVipActive,
          vipExpiresAt: user.investorVipExpiresAt?.toISOString() ?? null,
          computedClawback,
          clawbackApplied,
          clawbackCapped,
          clawbackReferenceId: CLAWBACK_REF,
          creditCount: clawbackLines.length,
          clawbackLines,
          walletBefore: beforeWallet,
          walletAfter: afterWallet,
        },
      },
    });

    if (clawbackApplied > 0) {
      await prisma.auditLog.create({
        data: {
          adminId: ADMIN_ID,
          action: 'ADMIN_ADJUSTMENT',
          targetId: USER_ID,
          metadata: {
            referenceId: CLAWBACK_REF,
            source: 'adjust-murekatete-yield-8-clawback',
            description: 'VIP 10% to 8% yield differential clawback',
            computedClawback,
            clawbackApplied,
            clawbackCapped,
            creditCount: clawbackLines.length,
          },
        },
      });
    }
  }

  const name = user.displayName?.trim() || 'there';
  const afterInvest = beforeInvest;
  const afterYield = Number(settings.dailyYieldPercent ?? NEW_DAILY_YIELD_PERCENT);
  const vipExpires = user.investorVipExpiresAt
    ? user.investorVipExpiresAt.toISOString().slice(0, 10)
    : null;

  const marker = readMarker();
  const emailsSent: { user?: boolean; admin?: boolean } = {};

  const userSubject = `Smart Invest update — daily yield set to ${NEW_DAILY_YIELD_PERCENT}%`;
  if (!marker.userEmail || force) {
    const clawbackNote =
      clawbackApplied > 0
        ? `<li><strong>Yield adjustment:</strong> While your account was on the VIP default ${PREVIOUS_EFFECTIVE_YIELD}% rate, you received <strong>$${computedClawback.toFixed(2)} USDT</strong> more than the ${NEW_DAILY_YIELD_PERCENT}% rate across ${clawbackLines.length} weekday credits. <strong>$${clawbackApplied.toFixed(2)} USDT</strong> has been deducted from your platform wallet to correct this.${clawbackCapped ? ' (Partial recovery — limited by available wallet balance.)' : ''}</li>`
        : '';

    const userHtml = layout(
      'Smart Invest daily yield update',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>Your Smart Invest account has been updated:</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li><strong>Daily yield rate:</strong> Your account is now set to <strong>${NEW_DAILY_YIELD_PERCENT}% daily yield</strong> on your Smart Invest balance (weekdays, Kampala time).</li>
        ${clawbackNote}
        <li><strong>VIP status:</strong> Your VIP membership remains active${vipExpires ? ` until <strong>${vipExpires}</strong>` : ''} — including $0 wallet withdrawal fees.</li>
      </ul>
      <p>Current balances:</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Platform wallet: <strong>$${afterWallet.toFixed(2)} USDT</strong></li>
        <li>Smart Invest: <strong>$${afterInvest.toFixed(2)} USDT</strong></li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">Future weekday yield credits will use the ${NEW_DAILY_YIELD_PERCENT}% rate.</p>
      ${button(`${frontendUrl}/invest`, 'View Smart Invest')}`,
    );

    const userTextParts = [
      `Hi ${name}, your Smart Invest daily yield is now ${NEW_DAILY_YIELD_PERCENT}%.`,
    ];
    if (clawbackApplied > 0) {
      userTextParts.push(
        `Excess earnings of $${clawbackApplied.toFixed(2)} USDT (${PREVIOUS_EFFECTIVE_YIELD}% vs ${NEW_DAILY_YIELD_PERCENT}% differential) were reversed from your wallet.`,
      );
    }
    userTextParts.push(
      `VIP remains active${vipExpires ? ` until ${vipExpires}` : ''}. Wallet: $${afterWallet.toFixed(2)} USDT. Smart Invest: $${afterInvest.toFixed(2)} USDT.`,
    );

    await sendEmail(EMAIL, userSubject, userHtml, userTextParts.join(' '));
    marker.userEmail = { sentAt: new Date().toISOString(), subject: userSubject };
    emailsSent.user = true;
  } else {
    emailsSent.user = false;
  }

  const adminSubject = `[Admin] Murekatete yield → ${NEW_DAILY_YIELD_PERCENT}% — clawback $${clawbackApplied.toFixed(2)} USDT`;
  if (!marker.adminEmail || force) {
    const linesHtml = clawbackLines
      .map(
        (l) =>
          `<li>${l.creditDate}: $${l.creditedAmount.toFixed(2)} @ ${l.yieldPercent}% → excess $${l.extraAmount.toFixed(2)}</li>`,
      )
      .join('');

    const adminHtml = layout(
      'Murekatete yield adjustment (admin)',
      `<p><strong>User:</strong> ${escapeHtml(name)} (${escapeHtml(EMAIL)})</p>
      <ul style="line-height:1.6;padding-left:20px">
        <li>Before effective yield: <strong>${beforeYield}%</strong> (VIP default)</li>
        <li>After stored yield: <strong>${afterYield}%</strong></li>
        <li>Computed excess (${YIELD_DIFFERENTIAL}% differential): <strong>$${computedClawback.toFixed(2)} USDT</strong> (${clawbackLines.length} credits)</li>
        <li>Clawback applied: <strong>$${clawbackApplied.toFixed(2)} USDT</strong>${clawbackCapped ? ' (capped at available balance)' : ''}</li>
        <li>Wallet: $${beforeWallet.toFixed(2)} → <strong>$${afterWallet.toFixed(2)} USDT</strong></li>
        <li>Smart Invest: <strong>$${afterInvest.toFixed(2)} USDT</strong></li>
        <li>VIP active until: <strong>${vipExpires ?? 'n/a'}</strong></li>
      </ul>
      <p>Credit breakdown:</p>
      <ul style="line-height:1.6;padding-left:20px;font-size:14px;color:#94a3b8">${linesHtml}</ul>`,
    );

    const adminText = `Murekatete (${EMAIL}): yield ${beforeYield}% → ${afterYield}%. Computed excess $${computedClawback.toFixed(2)}, clawback $${clawbackApplied.toFixed(2)}. Wallet $${beforeWallet.toFixed(2)} → $${afterWallet.toFixed(2)}. Invest $${afterInvest.toFixed(2)}. VIP until ${vipExpires ?? 'n/a'}.`;

    await sendEmail(ADMIN_EMAIL, adminSubject, adminHtml, adminText);
    marker.adminEmail = { sentAt: new Date().toISOString(), subject: adminSubject };
    emailsSent.admin = true;
  } else {
    emailsSent.admin = false;
  }

  writeMarker(marker);

  console.log(
    JSON.stringify(
      {
        skipped: Boolean(existingClawback && existingAudit),
        userId: USER_ID,
        email: EMAIL,
        before: {
          effectiveYieldPercent: beforeYield,
          storedDailyYieldPercent:
            user.investorSettings?.dailyYieldPercent != null
              ? Number(user.investorSettings.dailyYieldPercent)
              : null,
          walletBalance: beforeWallet,
          investBalance: beforeInvest,
          investorVipActive: user.investorVipActive,
          investorVipExpiresAt: user.investorVipExpiresAt?.toISOString() ?? null,
        },
        after: {
          dailyYieldPercent: afterYield,
          walletBalance: afterWallet,
          investBalance: afterInvest,
          investorVipActive: user.investorVipActive,
          investorVipExpiresAt: user.investorVipExpiresAt?.toISOString() ?? null,
        },
        clawback: {
          creditCount: clawbackLines.length,
          computedTotal: computedClawback,
          applied: clawbackApplied,
          capped: clawbackCapped,
          referenceId: CLAWBACK_REF,
          lines: clawbackLines,
        },
        emailsSent,
        auditRef: AUDIT_REF,
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
