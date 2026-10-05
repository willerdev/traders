/**
 * Admin one-off: confirm Beatrice MoMo P2P withdrawal sent (admin confirm-sent flow).
 *
 * Usage: cd backend && npx tsx scripts/confirm-beatrice-momo-sent.ts
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
const PAYOUT_ID = 'cmtdmdyhr0001wfsrh5jdx6ni';
const P2P_ID = 'cmtdmdzk70005wfsr52tby7ww';
const USER_ID = 'cmsg56vj607fwku0137qv270f';
const EMAIL = 'dngororanod@gmail.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';

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

async function sendCompletionEmail(
  to: string,
  name: string,
  amountUsdt: number,
  amountUgx: number,
  momoPhone: string,
) {
  const ugx = amountUgx.toLocaleString('en-UG', { maximumFractionDigits: 0 });
  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">MoMo withdrawal complete</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your MoMo P2P withdrawal of <strong>$${amountUsdt.toFixed(2)} USDT</strong> (UGX ${escapeHtml(ugx)}) to <strong>${escapeHtml(momoPhone)}</strong> is marked complete (admin confirmed sent).</p>
    <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a></p>
  </div></body></html>`;
  const text = `MoMo P2P complete: $${amountUsdt.toFixed(2)} USDT / UGX ${ugx} to ${momoPhone}.`;

  if (!resendKey) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [to],
      subject: `MoMo withdrawal complete — UGX ${ugx}`,
      html,
      text,
    }),
    signal: AbortSignal.timeout(20000),
  });
  return res.ok;
}

async function main() {
  const row = await prisma.momoP2pWithdrawal.findUnique({
    where: { id: P2P_ID },
    include: {
      payout: true,
      user: { select: { id: true, email: true, displayName: true } },
    },
  });

  if (!row) throw new Error(`MoMo P2P ${P2P_ID} not found`);
  if (row.payoutId !== PAYOUT_ID) {
    throw new Error(`Payout mismatch: expected ${PAYOUT_ID}, got ${row.payoutId}`);
  }
  if (row.userId !== USER_ID || row.user.email?.toLowerCase() !== EMAIL) {
    throw new Error('User/email mismatch');
  }

  const before = {
    payoutStatus: row.payout.status,
    p2pStatus: row.status,
    amountUsdt: Number(row.amountUsdt),
    amountUgx: Number(row.amountUgx),
    rateUgxPerUsdt: Number(row.rateUgxPerUsdt),
    momoPhone: row.momoPhone,
    momoNetwork: row.momoNetwork,
  };

  let emailSent = false;
  const now = new Date();
  const confirmNote = `Admin ${ADMIN_ID} confirmed MoMo sent`;

  if (row.status === 'COMPLETED') {
    console.log(JSON.stringify({ skipped: 'already_completed', before }, null, 2));
    return;
  }
  if (row.status === 'CANCELLED') {
    throw new Error('MoMo P2P withdrawal was cancelled');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const p2p = await tx.momoP2pWithdrawal.update({
      where: { id: P2P_ID },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        completedBy: 'ADMIN',
        adminConfirmedAt: now,
      },
    });
    await tx.payout.update({
      where: { id: PAYOUT_ID },
      data: {
        status: 'PAID',
        processedAt: now,
        notes: `${row.payout.notes ?? ''} — ${confirmNote}`.trim(),
      },
    });
    return p2p;
  });

  emailSent = await sendCompletionEmail(
    EMAIL,
    row.recipientName || row.user.displayName || 'Beatrice',
    Number(row.amountUsdt),
    Number(row.amountUgx),
    row.momoPhone,
  );

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'ADMIN_ADJUSTMENT',
      targetId: USER_ID,
      metadata: {
        source: 'confirm-beatrice-momo-sent',
        payoutId: PAYOUT_ID,
        p2pId: P2P_ID,
        before,
        after: {
          payoutStatus: 'PAID',
          p2pStatus: 'COMPLETED',
        },
        emailSent,
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        user: {
          id: USER_ID,
          email: EMAIL,
          displayName: row.user.displayName,
        },
        payoutId: PAYOUT_ID,
        p2pId: P2P_ID,
        before,
        after: {
          payoutStatus: 'PAID',
          p2pStatus: updated.status,
          processedAt: now.toISOString(),
          completedBy: 'ADMIN',
        },
        offlineSend: {
          amountUgx: Number(row.amountUgx),
          amountUgxFormatted: Number(row.amountUgx).toLocaleString('en-UG', {
            maximumFractionDigits: 0,
          }),
          amountUsdtNet: Number(row.amountUsdt),
          rateUgxPerUsdt: Number(row.rateUgxPerUsdt),
          momoPhone: row.momoPhone,
          momoNetwork: row.momoNetwork,
          grossUsdt: Number(row.payout.virtualProfit),
        },
        emailSent,
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
