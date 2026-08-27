/**
 * Credit $5100, approve blockchain KYC, fund chain vault for willer.
 * Usage: cd backend && npx tsx scripts/willer-blockchain-deposit.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { addKampalaWeekdays } from '../src/common/kampala-weekend.util';

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

const USER_ID = 'cmqmtehqi0000wfaxxntkiua9';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'willeratmit12@gmail.com';
const DEPOSIT_USDT = 5100;
const TRANSFER_GROSS = 5100;
const FEE_PERCENT = 10;
const LOCK_DAYS = 5;

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  if (!user?.email || user.email.toLowerCase() !== EMAIL) {
    throw new Error('User email mismatch');
  }

  const name = user.displayName?.trim() || 'there';
  const now = new Date();
  const fee = Math.round(((TRANSFER_GROSS * FEE_PERCENT) / 100) * 100) / 100;
  const net = Math.round((TRANSFER_GROSS - fee) * 100) / 100;
  const yieldPercent = net <= 5000 ? 10 : 15;
  const lockUntil = addKampalaWeekdays(now, LOCK_DAYS);
  const unlockLabel = lockUntil.toLocaleString('en-US', {
    timeZone: 'Africa/Kampala',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  await prisma.platformWallet.upsert({
    where: { userId: USER_ID },
    create: { userId: USER_ID },
    update: {},
  });

  const walletBefore = Number(
    (await prisma.platformWallet.findUnique({ where: { userId: USER_ID } }))!
      .availableBalance,
  );
  const balanceAfterDeposit = Math.round((walletBefore + DEPOSIT_USDT) * 100) / 100;

  await prisma.$transaction([
    prisma.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: balanceAfterDeposit },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: DEPOSIT_USDT,
        type: 'ADJUSTMENT',
        referenceId: `admin_${ADMIN_ID}_deposit`,
        description: `Admin deposit — $${DEPOSIT_USDT.toFixed(2)} USDT`,
        balanceAfter: balanceAfterDeposit,
      },
    }),
  ]);

  await sendEmail(
    user.email,
    `Admin deposited $${DEPOSIT_USDT.toFixed(2)} USDT to your wallet`,
    layout(
      'Admin deposit received',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>An administrator deposited <strong>$${DEPOSIT_USDT.toFixed(2)} USDT</strong> into your platform wallet.</p>
      <p>Available balance: <strong>$${balanceAfterDeposit.toFixed(2)} USDT</strong></p>
      ${button(`${frontendUrl}/wallet`, 'View wallet')}`,
    ),
    `Admin deposited $${DEPOSIT_USDT.toFixed(2)} USDT. Balance: $${balanceAfterDeposit.toFixed(2)} USDT.`,
  );
  console.log('deposit email sent');

  await prisma.chainContractEnrollment.upsert({
    where: { userId: USER_ID },
    create: {
      userId: USER_ID,
      status: 'APPROVED',
      termsAcceptedAt: now,
      approvedAt: now,
      withdrawFeePercent: 5,
    },
    update: {
      status: 'APPROVED',
      approvedAt: now,
      rejectionReason: null,
    },
  });

  await sendEmail(
    user.email,
    'Blockchain KYC approved — choose a deposit option',
    layout(
      'Blockchain verification approved',
      `<p>Hi ${escapeHtml(name)},</p>
      <p>Your <strong>blockchain contract</strong> identity check is approved.</p>
      <p>You can fund your on-chain vault from your platform wallet on the Blockchain page.</p>
      ${button(`${frontendUrl}/blockchain`, 'Open Blockchain')}`,
    ),
    `Blockchain KYC approved. Fund your vault at ${frontendUrl}/blockchain`,
  );
  console.log('kyc approved email sent');

  if (balanceAfterDeposit < TRANSFER_GROSS) {
    throw new Error(
      `Insufficient balance after deposit: need $${TRANSFER_GROSS}, have $${balanceAfterDeposit}`,
    );
  }

  const reference = `chain_allocate_${randomUUID()}`;
  const balanceAfterContract =
    Math.round((balanceAfterDeposit - TRANSFER_GROSS) * 100) / 100;

  await prisma.$transaction([
    prisma.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: balanceAfterContract },
    }),
    prisma.chainVaultPosition.upsert({
      where: { userId: USER_ID },
      create: {
        userId: USER_ID,
        principalBalance: net,
        profitBalance: 0,
        yieldPercent,
        lockedUntil: lockUntil,
      },
      update: {
        principalBalance: { increment: net },
        yieldPercent,
        lockedUntil: lockUntil,
      },
    }),
    prisma.chainContractEnrollment.update({
      where: { userId: USER_ID },
      data: {
        status: 'ACTIVE',
        activatedAt: now,
        yieldPercent,
      },
    }),
    prisma.chainDeposit.create({
      data: {
        userId: USER_ID,
        wallet: `platform-wallet:${USER_ID}`,
        amount: net,
        hash: reference,
        status: 'SUCCESS',
      },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -fee,
        type: 'CHAIN_ENROLLMENT_FEE',
        referenceId: reference,
        description: `Blockchain enrollment fee ${FEE_PERCENT}% — $${fee.toFixed(2)} USDT on $${TRANSFER_GROSS.toFixed(2)} transfer`,
        balanceAfter: balanceAfterDeposit - fee,
      },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -net,
        type: 'CHAIN_ALLOCATE',
        referenceId: reference,
        description: `Transferred $${net.toFixed(2)} USDT to blockchain wallet after $${fee.toFixed(2)} fee; locked until ${lockUntil.toISOString()}`,
        balanceAfter: balanceAfterContract,
      },
    }),
    prisma.chainNotification.create({
      data: {
        userId: USER_ID,
        type: 'vault_funded',
        title: 'Blockchain wallet funded',
        message: `$${TRANSFER_GROSS.toFixed(2)} USDT from platform wallet: $${fee.toFixed(2)} enrollment fee, $${net.toFixed(2)} locked for ${LOCK_DAYS} business days.`,
        severity: 'success',
      },
    }),
  ]);

  await sendEmail(
    user.email,
    `Blockchain wallet funded — $${net.toFixed(2)} locked for 5 business days`,
    layout(
      'Blockchain wallet funded',
      `<p>Hi ${escapeHtml(name)},</p>
      <p><strong>$${TRANSFER_GROSS.toFixed(2)} USDT</strong> left your platform wallet for blockchain investment.</p>
      <p>Enrollment fee: <strong>$${fee.toFixed(2)} USDT</strong> (${FEE_PERCENT}% of $${TRANSFER_GROSS.toFixed(2)}). Net invested: <strong>$${net.toFixed(2)} USDT</strong>.</p>
      <p>Daily yield rate: <strong>${yieldPercent}%</strong></p>
      <p>Principal and profit are locked for five business days until <strong>${escapeHtml(unlockLabel)} (Kampala time)</strong>.</p>
      ${button(`${frontendUrl}/blockchain`, 'View blockchain wallet')}`,
    ),
    `$${TRANSFER_GROSS.toFixed(2)} USDT moved to blockchain (${FEE_PERCENT}% fee $${fee.toFixed(2)}; $${net.toFixed(2)} invested at ${yieldPercent}%). Unlocks ${unlockLabel} Kampala time.`,
  );
  console.log('blockchain funded email sent');

  const final = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: {
      platformWallet: true,
      chainContractEnrollment: true,
      chainVaultPosition: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        email: final?.email,
        walletBalance: Number(final?.platformWallet?.availableBalance ?? 0),
        chainStatus: final?.chainContractEnrollment?.status,
        vaultPrincipal: Number(final?.chainVaultPosition?.principalBalance ?? 0),
        vaultYield: Number(final?.chainVaultPosition?.yieldPercent ?? 0),
        lockedUntil: final?.chainVaultPosition?.lockedUntil?.toISOString(),
        transfer: { gross: TRANSFER_GROSS, fee, net, yieldPercent },
        emailsSent: ['deposit', 'kyc-approved', 'blockchain-funded'],
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
