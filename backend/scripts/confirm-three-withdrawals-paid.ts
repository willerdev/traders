/**
 * Admin one-off: mark PatOshi, NVS, and MOISE wallet withdrawals as PAID
 * and send withdrawal confirmation emails.
 *
 * Usage: cd backend && npx tsx scripts/confirm-three-withdrawals-paid.ts
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

const PAYOUTS = [
  {
    id: 'cmtfq04450j87ks01jlwb5tfc',
    email: 'patrickishi89@gmail.com',
    expectedNet: 194.85,
  },
  {
    id: 'cmtd6ruw60fchki014ebzwla3',
    email: 'flink76666@gmail.com',
    expectedNet: 1000.96,
  },
  {
    id: 'cmtdaln2e00c7ks014rzdlogp',
    email: 'moisentak@gmail.com',
    expectedNet: 111.52,
  },
] as const;

const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const emailFrom =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
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

function maskWallet(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

async function sendWithdrawalCompleteEmail(
  to: string,
  name: string,
  netAmount: number,
  walletAddress: string,
): Promise<{ sent: boolean; subject: string }> {
  const wallet = maskWallet(walletAddress);
  const subject = `Withdrawal complete — $${netAmount.toFixed(2)} USDT`;
  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">Withdrawal complete</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your withdrawal of <strong>$${netAmount.toFixed(2)} USDT</strong> has been processed successfully.</p>
    <p>Sent to <code style="color:#93c5fd;">${escapeHtml(wallet)}</code> (TRC20).</p>
    <p style="color:#94a3b8;font-size:14px;">Funds should appear in your wallet shortly once the network confirms the transfer.</p>
    <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a></p>
  </div></body></html>`;
  const text = `Hi ${name}, your withdrawal of $${netAmount.toFixed(2)} USDT has been processed successfully. Sent to ${wallet} (TRC20). ${frontendUrl}/wallet`;

  if (!resendKey) return { sent: false, subject };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [to],
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return { sent: true, subject };
}

async function main() {
  const results: Array<Record<string, unknown>> = [];

  for (const spec of PAYOUTS) {
    const payout = await prisma.payout.findUnique({
      where: { id: spec.id },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });

    if (!payout) throw new Error(`Payout ${spec.id} not found`);
    if (payout.user.email?.toLowerCase() !== spec.email) {
      throw new Error(
        `Email mismatch for ${spec.id}: expected ${spec.email}, got ${payout.user.email}`,
      );
    }

    const net = Number(payout.traderShare);
    if (Math.abs(net - spec.expectedNet) > 0.01) {
      throw new Error(
        `Amount mismatch for ${spec.id}: expected ~$${spec.expectedNet}, got $${net}`,
      );
    }

    const destination = payout.walletAddress?.trim();
    if (!destination) throw new Error(`Payout ${spec.id} missing wallet address`);

    const before = {
      status: payout.status,
      traderShare: net,
      processedAt: payout.processedAt?.toISOString() ?? null,
    };

    if (payout.status === 'PAID') {
      results.push({
        payoutId: spec.id,
        email: spec.email,
        skipped: 'already_paid',
        before,
      });
      continue;
    }

    if (payout.status !== 'PENDING') {
      throw new Error(
        `Unexpected status for ${spec.id}: ${payout.status} (expected PENDING)`,
      );
    }

    const now = new Date();
    const confirmNote = `Confirmed by admin ${ADMIN_ID}`;

    const updated = await prisma.payout.update({
      where: { id: spec.id },
      data: {
        status: 'PAID',
        processedAt: now,
        notes: `${payout.notes ?? ''} — ${confirmNote}`.trim(),
      },
    });

    const emailResult = await sendWithdrawalCompleteEmail(
      spec.email,
      payout.user.displayName || spec.email.split('@')[0],
      net,
      destination,
    );

    await prisma.auditLog.create({
      data: {
        adminId: ADMIN_ID,
        action: 'ADMIN_ADJUSTMENT',
        targetId: payout.user.id,
        metadata: {
          source: 'confirm-three-withdrawals-paid',
          payoutId: spec.id,
          before,
          after: {
            status: updated.status,
            processedAt: updated.processedAt?.toISOString() ?? null,
          },
          emailSent: emailResult.sent,
          emailSubject: emailResult.subject,
        },
      },
    });

    results.push({
      payoutId: spec.id,
      email: spec.email,
      displayName: payout.user.displayName,
      netAmount: net,
      wallet: maskWallet(destination),
      before,
      after: {
        status: updated.status,
        processedAt: updated.processedAt?.toISOString() ?? null,
      },
      emailSent: emailResult.sent,
      emailSubject: emailResult.subject,
    });
  }

  console.log(JSON.stringify({ results }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
