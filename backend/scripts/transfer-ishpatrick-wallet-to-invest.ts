/**
 * One-off: move full wallet balance → Smart Invest for ishpatrick040@gmail.com (admin transfer, no fee).
 * Usage: cd backend && npx tsx scripts/transfer-ishpatrick-wallet-to-invest.ts
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

const USER_ID = 'cmrooiy6s0drikf010pbq2cn1';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const EMAIL = 'ishpatrick040@gmail.com';

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

  const openLoan = await prisma.loan.findFirst({
    where: { userId: USER_ID, status: 'APPROVED' },
  });
  if (openLoan) {
    throw new Error(
      `Open loan ${openLoan.id} blocks self-serve reinvest (admin transfer would still work)`,
    );
  }

  const wallet = user.platformWallet ?? (await prisma.platformWallet.create({ data: { userId: USER_ID } }));
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
        amount: -rounded,
        type: 'INVESTOR_ALLOCATE',
        referenceId: `admin_${ADMIN_ID}`,
        description: `Admin moved $${rounded.toFixed(2)} USDT from wallet to investment`,
        balanceAfter: nextAvailable,
      },
    }),
    prisma.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'INVESTOR_TRANSFER',
        targetId: USER_ID,
        metadata: {
          amount: rounded,
          direction: 'to_investment',
          feeAmount,
          feePercent,
          netInvested,
        },
      },
    }),
  ]);

  const name = user.displayName?.trim() || 'there';
  await sendEmail(
    user.email,
    `$${netInvested.toFixed(2)} USDT allocated to Smart Invest`,
    layout(
      'Wallet allocated to Smart Invest',
      `<p>Hi ${escapeHtml(name)},</p>
      <p><strong>$${rounded.toFixed(2)} USDT</strong> was moved from your platform wallet to Smart Invest.</p>
      <p>Amount added to investment: <strong>$${netInvested.toFixed(2)} USDT</strong></p>
      <p>Available wallet balance: <strong>$${nextAvailable.toFixed(2)} USDT</strong></p>
      <p>Smart Invest balance: <strong>$${nextInvested.toFixed(2)} USDT</strong></p>
      ${button(`${frontendUrl}/invest`, 'Open Smart Invest')}`,
    ),
    `$${rounded.toFixed(2)} USDT moved to Smart Invest. Investment balance: $${nextInvested.toFixed(2)} USDT.`,
  );

  const after = await prisma.platformWallet.findUnique({ where: { userId: USER_ID } });
  console.log(
    JSON.stringify(
      {
        email: user.email,
        displayName: user.displayName,
        method: 'admin transfer (0% fee)',
        amountMoved: rounded,
        feePercent,
        feeAmount,
        netInvested,
        before: {
          walletBalance: availableBefore,
          investmentBalance: investedBefore,
        },
        after: {
          walletBalance: Number(after?.availableBalance ?? 0),
          investmentBalance: Number(after?.investorBalance ?? 0),
        },
        openLoan: null,
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
