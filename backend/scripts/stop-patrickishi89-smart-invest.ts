/**
 * Admin one-off: stop Smart Invest for patrickishi89@gmail.com (PatOshi).
 * Deactivates enrollment, pauses yield/trading flags. No external withdrawal —
 * user already redeemed investment and withdrew wallet balance.
 *
 * Usage: cd backend && npx tsx scripts/stop-patrickishi89-smart-invest.ts
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

const USER_ID = 'cmrchfw1d007kkp01whxgsukj';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'patrickishi89@gmail.com';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const AUDIT_REF = 'patrickishi89_stop_smart_invest_2026-09-11';

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
  const existingAudit = await prisma.auditLog.findFirst({
    where: {
      targetId: USER_ID,
      action: 'INVESTOR_DEACTIVATE',
      metadata: { path: ['reference'], equals: AUDIT_REF },
    },
  });
  if (existingAudit) {
    const user = await prisma.user.findUnique({
      where: { id: USER_ID },
      include: { platformWallet: true, investorSettings: true },
    });
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'Already stopped (idempotent)',
          email: user?.email,
          investorActive: user?.investorActive,
          walletBalance: Number(user?.platformWallet?.availableBalance ?? 0),
          investmentBalance: Number(user?.platformWallet?.investorBalance ?? 0),
          settings: user?.investorSettings
            ? {
                paused: user.investorSettings.paused,
                yieldPaused: user.investorSettings.yieldPaused,
              }
            : null,
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

  const before = {
    investorActive: user.investorActive,
    investorEnrolledAt: user.investorEnrolledAt?.toISOString() ?? null,
    walletBalance: Number(user.platformWallet?.availableBalance ?? 0),
    investmentBalance: Number(user.platformWallet?.investorBalance ?? 0),
    paused: user.investorSettings?.paused ?? false,
    yieldPaused: user.investorSettings?.yieldPaused ?? false,
    dailyYieldPercent:
      user.investorSettings?.dailyYieldPercent != null
        ? Number(user.investorSettings.dailyYieldPercent)
        : null,
    committedInvestmentAmount:
      user.investorSettings?.committedInvestmentAmount != null
        ? Number(user.investorSettings.committedInvestmentAmount)
        : null,
  };

  if (!user.investorActive && before.paused && before.yieldPaused) {
    console.log(
      JSON.stringify(
        { skipped: true, reason: 'Already inactive and paused', before },
        null,
        2,
      ),
    );
    return;
  }

  const investedToRedeem = Math.round(before.investmentBalance * 100) / 100;
  const redeemRef = `${AUDIT_REF}_redeem`;

  await prisma.$transaction(async (tx) => {
    if (investedToRedeem > 0) {
      const wallet =
        user.platformWallet ??
        (await tx.platformWallet.create({ data: { userId: USER_ID } }));
      const nextAvailable =
        Math.round(
          (Number(wallet.availableBalance) + investedToRedeem) * 100,
        ) / 100;
      await tx.platformWallet.update({
        where: { userId: USER_ID },
        data: {
          availableBalance: nextAvailable,
          investorBalance: 0,
        },
      });
      await tx.walletTransaction.create({
        data: {
          userId: USER_ID,
          amount: investedToRedeem,
          type: 'INVESTOR_REDEEM',
          referenceId: redeemRef,
          description: `Admin stop Smart Invest — $${investedToRedeem.toFixed(2)} USDT moved to wallet`,
          balanceAfter: nextAvailable,
        },
      });
    }

    await tx.user.update({
      where: { id: USER_ID },
      data: {
        investorActive: false,
        investorVipActive: false,
        investorVvipActive: false,
      },
    });
    await tx.investorSettings.upsert({
      where: { userId: USER_ID },
      create: {
        userId: USER_ID,
        paused: true,
        yieldPaused: true,
      },
      update: {
        paused: true,
        yieldPaused: true,
      },
    });
    await tx.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_DEACTIVATE',
        targetId: USER_ID,
        metadata: {
          reference: AUDIT_REF,
          email: user.email,
          reason: 'Admin request — stop Smart Invest',
          before,
          transferToWallet: investedToRedeem > 0,
          redeemedUsdt: investedToRedeem,
          redeemRef: investedToRedeem > 0 ? redeemRef : null,
        },
      },
    });
  });

  const afterUser = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { platformWallet: true, investorSettings: true },
  });

  const after = {
    investorActive: afterUser?.investorActive ?? false,
    walletBalance: Number(afterUser?.platformWallet?.availableBalance ?? 0),
    investmentBalance: Number(afterUser?.platformWallet?.investorBalance ?? 0),
    paused: afterUser?.investorSettings?.paused ?? false,
    yieldPaused: afterUser?.investorSettings?.yieldPaused ?? false,
  };

  const name = user.displayName?.trim() || 'there';
  const redeemedUsdt =
    before.investmentBalance > 0
      ? Math.round(before.investmentBalance * 100) / 100
      : 0;

  const userSubject = 'Smart Invest stopped on your account';
  const userHtml = layout(
    'Smart Invest stopped',
    `<p>Hi ${escapeHtml(name)},</p>
    <p>An administrator has <strong>stopped Smart Invest</strong> on your account.</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>Daily yield: <strong>stopped</strong> — no further weekday credits</li>
      <li>Smart Invest balance: <strong>$${after.investmentBalance.toFixed(2)} USDT</strong></li>
      <li>Platform wallet: <strong>$${after.walletBalance.toFixed(2)} USDT</strong> (available for withdrawal)</li>
    </ul>
    <p style="color:#94a3b8;font-size:14px;">Any funds in your platform wallet remain yours. Message Support from your dashboard if you have questions.</p>
    <p><a href="${frontendUrl}/wallet" style="color:#93c5fd">Open wallet</a> · <a href="${frontendUrl}/messages" style="color:#93c5fd">Contact support</a></p>`,
  );
  const userText = `Hi ${name}, Smart Invest has been stopped by admin. No more daily yield. Smart Invest: $${after.investmentBalance.toFixed(2)} USDT. Platform wallet: $${after.walletBalance.toFixed(2)} USDT. Contact support if you have questions. ${frontendUrl}/wallet`;

  const adminSubject = `[Admin] PatOshi Smart Invest stopped — wallet $${after.walletBalance.toFixed(2)}, invest $${after.investmentBalance.toFixed(2)}`;
  const adminHtml = layout(
    'PatOshi Smart Invest stopped',
    `<p>Smart Invest deactivation completed for <strong>${escapeHtml(EMAIL)}</strong>.</p>
    <ul style="line-height:1.6;padding-left:20px">
      <li>User: ${escapeHtml(name)} (${escapeHtml(EMAIL)})</li>
      <li>Before — active: ${before.investorActive}, paused: ${before.paused}, yieldPaused: ${before.yieldPaused}</li>
      <li>Before — wallet: $${before.walletBalance.toFixed(2)}, Smart Invest: $${before.investmentBalance.toFixed(2)}</li>
      <li>After — active: ${after.investorActive}, paused: ${after.paused}, yieldPaused: ${after.yieldPaused}</li>
      <li>After — wallet: $${after.walletBalance.toFixed(2)}, Smart Invest: $${after.investmentBalance.toFixed(2)}</li>
      <li>Redeemed to wallet: ${redeemedUsdt > 0 ? `$${redeemedUsdt.toFixed(2)} USDT` : 'none (investment already $0)'}</li>
    </ul>`,
  );
  const adminText = `PatOshi (${EMAIL}): Smart Invest stopped. investorActive ${before.investorActive}→${after.investorActive}. Wallet $${before.walletBalance}→$${after.walletBalance}, Invest $${before.investmentBalance}→$${after.investmentBalance}.`;

  let userEmailSent = false;
  let adminEmailSent = false;
  try {
    userEmailSent = await sendEmail(EMAIL, userSubject, userHtml, userText);
  } catch (err) {
    console.warn('User email failed:', err instanceof Error ? err.message : err);
  }
  try {
    adminEmailSent = await sendEmail(
      ADMIN_EMAIL,
      adminSubject,
      adminHtml,
      adminText,
    );
  } catch (err) {
    console.warn('Admin email failed:', err instanceof Error ? err.message : err);
  }

  console.log(
    JSON.stringify(
      {
        email: user.email,
        displayName: user.displayName,
        before,
        after,
        changes: {
          investorActive: `${before.investorActive} → ${after.investorActive}`,
          paused: `${before.paused} → ${after.paused}`,
          yieldPaused: `${before.yieldPaused} → ${after.yieldPaused}`,
          transferToWallet:
            redeemedUsdt > 0
              ? `$${redeemedUsdt.toFixed(2)} USDT redeemed to wallet`
              : 'skipped (investment balance already $0)',
        },
        auditAction: 'INVESTOR_DEACTIVATE',
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
