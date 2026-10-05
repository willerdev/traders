/**
 * Credit $840 USDT to erukundo181@gmail.com on Soloema (soloweb).
 * Usage: DATABASE_URL=... npx tsx scripts/credit-erukundo181-deposit-840.ts
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
const EMAIL = 'erukundo181@gmail.com';
const AMOUNT = 840;
const REFERENCE = 'erukundo181_deposit_840_2026-09-24';
const WALLET_URL = 'https://soloema-web.onrender.com/wallet';
const apiKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'soloRukundo <noreply@thetradeguard.com>';
const adminEmail = 'willeratmit12@gmail.com';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const probe = await prisma.user.findFirst({
    where: { email: { equals: 'etuyizere64@gmail.com', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!probe) throw new Error('Wrong database (etuyizere64 missing) — abort');

  const user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
    include: { platformWallet: true },
  });
  if (!user?.email) throw new Error(`User not found: ${EMAIL}`);

  const existing = await prisma.walletTransaction.findFirst({
    where: { userId: user.id, referenceId: REFERENCE },
  });
  if (existing) {
    console.log(
      JSON.stringify({
        skipped: true,
        reason: 'already_processed',
        userId: user.id,
        wallet: Number(user.platformWallet?.availableBalance ?? 0),
        emailSent: false,
      }),
    );
    return;
  }

  const before = Number(user.platformWallet?.availableBalance ?? 0);
  const after = Math.round((before + AMOUNT) * 100) / 100;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.platformWallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, availableBalance: after },
      update: { availableBalance: after },
    });
    await tx.walletTransaction.create({
      data: {
        userId: user.id,
        amount: AMOUNT,
        type: 'DEPOSITOR_DEPOSIT',
        referenceId: REFERENCE,
        description: `Platform wallet deposit — $${AMOUNT.toFixed(2)} USDT`,
        balanceAfter: after,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        autoWithdrawEligible: true,
        autoWithdrawEligibleAt: user.autoWithdrawEligibleAt ?? now,
      },
    });
  });

  const name = user.displayName?.trim() || 'Rukundo';
  const html = `<!DOCTYPE html><html><body style="background:#0c1410;color:#f4f1ea;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#14201a;border-radius:12px;padding:24px">
    <h1 style="color:#c4a35a;font-size:20px">$${AMOUNT.toFixed(0)} USDT credited</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p><strong>$${AMOUNT.toFixed(2)} USDT</strong> was added to your soloRukundo wallet. Your available balance is now <strong>$${after.toFixed(2)} USDT</strong>.</p>
    <p><a href="${WALLET_URL}" style="display:inline-block;background:#c4a35a;color:#0c1410;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open wallet</a></p>
  </div></body></html>`;
  const text = `Hi ${name},

$${AMOUNT.toFixed(2)} USDT was added to your soloRukundo wallet.
Available balance: $${after.toFixed(2)} USDT

Open wallet: ${WALLET_URL}`;

  await sendEmail(
    user.email,
    `$${AMOUNT.toFixed(0)} USDT credited to your soloRukundo wallet`,
    html,
    text,
  );

  await sendEmail(
    adminEmail,
    `[soloRukundo] Deposit $${AMOUNT} — ${name} (${EMAIL})`,
    `<p>${escapeHtml(name)} (${escapeHtml(EMAIL)}) credited $${AMOUNT.toFixed(2)}. Wallet now $${after.toFixed(2)}. User id ${escapeHtml(user.id)}.</p>`,
    `${name} ${EMAIL} +$${AMOUNT}. wallet=${after} userId=${user.id}`,
  );

  console.log(
    JSON.stringify({
      ok: true,
      userId: user.id,
      email: user.email,
      before,
      after,
      amount: AMOUNT,
      emailSent: true,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
