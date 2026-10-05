/**
 * Bulk-approve all PENDING KYC verifications.
 * Matches admin.service approveKyc + sunday-withdraw-batch approveAllPendingKyc.
 *
 * Usage: cd backend && npx tsx scripts/approve-all-pending-kyc.ts
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
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const SCRIPT_SOURCE = 'script_approve_all_pending_kyc';
const DEFAULT_KYC_REWARD = 0.5;

const apiKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Tradeguard <info@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailLayout(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">${escapeHtml(title)}</h1>
    ${body}
  </div></body></html>`;
}

async function sendKycApprovedEmail(
  to: string,
  displayName: string,
): Promise<boolean> {
  if (!apiKey) {
    console.warn('  RESEND_API_KEY missing — skipping KYC approved email');
    return false;
  }
  const html = emailLayout(
    'KYC verified',
    `<p>Hi ${escapeHtml(displayName)},</p>
    <p>Your identity verification (KYC) has been <strong>approved</strong>.</p>
    <p>You can now request payouts when you have eligible weekly earnings.</p>
    <p><a href="${frontendUrl}/payouts" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">Go to payouts</a></p>`,
  );
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'KYC approved — you can request payouts',
      html,
      text: 'Your KYC was approved. You can request payouts on thetradeguard.com.',
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn(`  Email failed for ${to}: ${err}`);
    return false;
  }
  return true;
}

async function accrueReferralKycReward(referredUserId: string, kycReward: number) {
  if (kycReward <= 0) return;

  const referred = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: {
      id: true,
      displayName: true,
      referredById: true,
      referralKycRewardedAt: true,
    },
  });
  if (!referred?.referredById || referred.referralKycRewardedAt) return;

  await prisma.user.update({
    where: { id: referredUserId },
    data: { referralKycRewardedAt: new Date() },
  });

  await prisma.platformNotification
    .create({
      data: {
        userId: referred.referredById,
        type: 'REFERRAL_REWARD',
        title: `Referral milestone — $${kycReward} pending`,
        body: `${referred.displayName} completed KYC verification. $${kycReward} USDT will be paid to your wallet when the reward is settled.`,
        linkUrl: '/settings',
      },
    })
    .catch(() => undefined);

  console.log(
    `  Referral KYC reward accrued for referrer of ${referred.displayName}`,
  );
}

async function main() {
  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
  });
  const kycReward = Number(config?.referralKycRewardUsdt ?? DEFAULT_KYC_REWARD);

  const pending = await prisma.kycVerification.findMany({
    where: { status: 'PENDING' },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  if (pending.length === 0) {
    console.log('No pending KYC records found.');
    return;
  }

  console.log(`Found ${pending.length} pending KYC record(s).\n`);

  const results: Array<{
    name: string;
    email: string;
    previousStatus: string;
    newStatus: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const kyc of pending) {
    const { displayName, email } = kyc.user;
    console.log(`Approving KYC for ${displayName} (${email})...`);
    try {
      await prisma.kycVerification.update({
        where: { userId: kyc.userId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          adminId: ADMIN_ID,
          action: 'KYC_APPROVED',
          targetId: kyc.userId,
          metadata: { source: SCRIPT_SOURCE },
        },
      });

      await sendKycApprovedEmail(email, displayName).catch(() => false);
      await accrueReferralKycReward(kyc.userId, kycReward).catch(() => undefined);

      results.push({
        name: displayName,
        email,
        previousStatus: 'PENDING',
        newStatus: 'APPROVED',
        ok: true,
      });
      console.log('  OK\n');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        name: displayName,
        email,
        previousStatus: 'PENDING',
        newStatus: 'PENDING',
        ok: false,
        error: message,
      });
      console.error(`  FAILED: ${message}\n`);
    }
  }

  const approved = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log('--- Summary ---');
  console.log(`Approved: ${approved} / ${pending.length}`);
  for (const r of results) {
    const status = r.ok
      ? `${r.previousStatus} → ${r.newStatus}`
      : `${r.previousStatus} (failed: ${r.error})`;
    console.log(`- ${r.name} | ${r.email} | ${status}`);
  }
  if (failed.length > 0) {
    console.log(`\nFailures: ${failed.length}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
