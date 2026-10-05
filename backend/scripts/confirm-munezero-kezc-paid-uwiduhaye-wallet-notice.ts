/**
 * Admin one-off:
 * - Mark Munezero + KezC DEPOSITOR withdrawals PAID (manual TRC20 sent)
 * - Send standard withdrawal-complete emails (no admin/manual wording)
 * - Uwiduhaye Diane: leave PENDING, admin note (shared wallet), wallet-issue email
 *
 * Idempotent: skips PAID payouts; email marker file unless FORCE=1.
 *
 * Usage: cd backend && npx tsx scripts/confirm-munezero-kezc-paid-uwiduhaye-wallet-notice.ts
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
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const force = process.env.FORCE === '1';
const markerPath = resolve(
  __dirname,
  '.sent-munezero-kezc-paid-uwiduhaye-wallet-notice.json',
);

const PAID_PAYOUTS = [
  {
    id: 'cmtpc4dgq0bjtin01pzss2jmg',
    email: 'ngwinondebecharlotte@gmail.com',
    expectedNet: 128.93,
  },
  {
    id: 'cmtpby2p40bhvin01kpn9gs7z',
    email: 'christinek085@gmail.com',
    expectedNet: 110.13,
  },
] as const;

const UWIDUHAye = {
  payoutId: 'cmtp3hj2u08zpin011iyjj742',
  userId: 'cms991i7m01zlfa0186vwzgli',
  email: 'uwiduhaye3@gmail.com',
  expectedNet: 393.48,
} as const;

const ADMIN_NOTE_MARKER =
  'Blocked — shared TRC20 wallet detected (duplicate across accounts); user notified to submit unique wallet';

const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const emailFrom =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';

type Marker = {
  withdrawalComplete?: Record<string, { sentAt: string; subject: string }>;
  uwiduhayeWalletNotice?: { sentAt: string; subject: string };
  adminCopy?: { sentAt: string; subject: string };
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

function maskWallet(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  text: string,
): Promise<boolean> {
  if (!resendKey) throw new Error('RESEND_API_KEY missing');
  const recipients = Array.isArray(to) ? to : [to];
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom,
          to: recipients,
          subject,
          html,
          text,
        }),
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

function withdrawalCompleteEmail(
  name: string,
  netAmount: number,
  walletAddress: string,
) {
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
  return { subject, html, text };
}

function uwiduhayeWalletIssueEmail(name: string, netAmount: number) {
  const subject = 'Withdrawal update — wallet verification required';
  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">Withdrawal update</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>We reviewed your pending withdrawal of <strong>$${netAmount.toFixed(2)} USDT</strong> and are unable to complete it with your current TRC20 wallet on file.</p>
    <p><strong>What happened</strong></p>
    <p>Our verification detected that this wallet address is already linked to another account on the platform. For security and compliance, each withdrawal wallet must be unique to your account and not shared with or verified on any other profile.</p>
    <p><strong>What to do next</strong></p>
    <ul style="color:#cbd5e1;line-height:1.6;padding-left:18px">
      <li>Add a new, unique USDT (TRC20) wallet address that belongs only to you</li>
      <li>Ensure it is not already saved on any other account</li>
      <li>Update your withdrawal request or contact support if you need help</li>
    </ul>
    <p>Your withdrawal request remains pending until a valid unique wallet is provided. Funds have not been sent to the current address.</p>
    <p style="color:#94a3b8;font-size:14px;">If you have questions, reply to this email or contact support through your dashboard.</p>
    <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Manage wallet</a></p>
  </div></body></html>`;
  const text = `Hi ${name}, your pending withdrawal of $${netAmount.toFixed(2)} USDT cannot be completed with your current TRC20 wallet because it is already linked to another account. Please add a new unique USDT (TRC20) wallet that is not used on any other account, then update your request or contact support. ${frontendUrl}/wallet`;
  return { subject, html, text };
}

async function markPaid(spec: (typeof PAID_PAYOUTS)[number]) {
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

  const confirmNote = `Confirmed by admin ${ADMIN_ID} — manual TRC20 sent outside NOWPayments (Sunday batch insufficient balance)`;

  let updated = payout;
  if (payout.status === 'PAID') {
    return {
      payoutId: spec.id,
      email: spec.email,
      displayName: payout.user.displayName,
      netAmount: net,
      wallet: maskWallet(destination),
      skippedPaid: true,
      before,
      after: {
        status: payout.status,
        processedAt: payout.processedAt?.toISOString() ?? null,
      },
    };
  }

  if (payout.status !== 'PENDING') {
    throw new Error(
      `Unexpected status for ${spec.id}: ${payout.status} (expected PENDING)`,
    );
  }

  updated = await prisma.payout.update({
    where: { id: spec.id },
    data: {
      status: 'PAID',
      processedAt: new Date(),
      notes: `${payout.notes ?? ''} — ${confirmNote}`.trim(),
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'ADMIN_ADJUSTMENT',
      targetId: payout.user.id,
      metadata: {
        source: 'confirm-munezero-kezc-paid-uwiduhaye-wallet-notice',
        payoutId: spec.id,
        settlement: 'external',
        before,
        after: {
          status: updated.status,
          processedAt: updated.processedAt?.toISOString() ?? null,
        },
      },
    },
  });

  return {
    payoutId: spec.id,
    email: spec.email,
    displayName: payout.user.displayName,
    netAmount: net,
    wallet: maskWallet(destination),
    walletAddress: destination,
    skippedPaid: false,
    before,
    after: {
      status: updated.status,
      processedAt: updated.processedAt?.toISOString() ?? null,
    },
  };
}

async function handleUwiduhaye() {
  const payout = await prisma.payout.findUnique({
    where: { id: UWIDUHAye.payoutId },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
    },
  });

  if (!payout) throw new Error(`Payout ${UWIDUHAye.payoutId} not found`);
  if (payout.user.email?.toLowerCase() !== UWIDUHAye.email) {
    throw new Error(
      `Email mismatch for Uwiduhaye: expected ${UWIDUHAye.email}, got ${payout.user.email}`,
    );
  }

  const net = Number(payout.traderShare);
  if (Math.abs(net - UWIDUHAye.expectedNet) > 0.01) {
    throw new Error(
      `Amount mismatch for Uwiduhaye: expected ~$${UWIDUHAye.expectedNet}, got $${net}`,
    );
  }

  const beforeStatus = payout.status;
  const notes = payout.notes ?? '';
  const noteAlreadyAdded = notes.includes(ADMIN_NOTE_MARKER);

  let updatedNotes = notes;
  if (!noteAlreadyAdded) {
    updatedNotes = `${notes} — ${ADMIN_NOTE_MARKER} (${ADMIN_ID})`.trim();
    await prisma.payout.update({
      where: { id: UWIDUHAye.payoutId },
      data: { notes: updatedNotes },
    });
  }

  if (beforeStatus !== 'PENDING') {
    return {
      payoutId: UWIDUHAye.payoutId,
      email: UWIDUHAye.email,
      displayName: payout.user.displayName,
      netAmount: net,
      status: beforeStatus,
      noteAdded: !noteAlreadyAdded,
      warning: `Expected PENDING, found ${beforeStatus}`,
    };
  }

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'ADMIN_ADJUSTMENT',
      targetId: UWIDUHAye.userId,
      metadata: {
        source: 'confirm-munezero-kezc-paid-uwiduhaye-wallet-notice',
        payoutId: UWIDUHAye.payoutId,
        action: 'shared_wallet_blocked_pending',
        noteAdded: !noteAlreadyAdded,
        netAmount: net,
      },
    },
  });

  return {
    payoutId: UWIDUHAye.payoutId,
    email: UWIDUHAye.email,
    displayName: payout.user.displayName,
    netAmount: net,
    status: 'PENDING',
    noteAdded: !noteAlreadyAdded,
  };
}

async function main() {
  const marker = readMarker();
  const paidResults = [];

  for (const spec of PAID_PAYOUTS) {
    const result = await markPaid(spec);
    paidResults.push(result);

    const markerKey = spec.id;
    const alreadySent = marker.withdrawalComplete?.[markerKey] && !force;
    if (!alreadySent && result.walletAddress) {
      const name = result.displayName || spec.email.split('@')[0];
      const { subject, html, text } = withdrawalCompleteEmail(
        name,
        result.netAmount,
        result.walletAddress,
      );
      const sent = await sendEmail(spec.email, subject, html, text);
      marker.withdrawalComplete = marker.withdrawalComplete ?? {};
      marker.withdrawalComplete[markerKey] = {
        sentAt: new Date().toISOString(),
        subject,
      };
      paidResults[paidResults.length - 1] = {
        ...result,
        emailSent: sent,
        emailSubject: subject,
      };
    } else if (alreadySent) {
      paidResults[paidResults.length - 1] = {
        ...result,
        emailSent: false,
        emailSubject: marker.withdrawalComplete?.[markerKey]?.subject,
        emailSkipped: 'already_sent',
      };
    }
  }

  const uwiduhaye = await handleUwiduhaye();
  const uwiduhayeAlreadySent = marker.uwiduhayeWalletNotice && !force;
  if (!uwiduhayeAlreadySent) {
    const name = uwiduhaye.displayName || 'Uwiduhaye Diane';
    const { subject, html, text } = uwiduhayeWalletIssueEmail(
      name,
      uwiduhaye.netAmount,
    );
    const sent = await sendEmail(UWIDUHAye.email, subject, html, text);
    marker.uwiduhayeWalletNotice = {
      sentAt: new Date().toISOString(),
      subject,
    };
    Object.assign(uwiduhaye, { emailSent: sent, emailSubject: subject });
  } else {
    Object.assign(uwiduhaye, {
      emailSent: false,
      emailSubject: marker.uwiduhayeWalletNotice?.subject,
      emailSkipped: 'already_sent',
    });
  }

  const adminAlreadySent = marker.adminCopy && !force;
  if (!adminAlreadySent) {
    const adminSubject =
      '[Admin] Withdrawals: Munezero + KezC paid; Uwiduhaye wallet blocked';
    const adminHtml = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px">
      <h2>Withdrawal admin actions</h2>
      <ul>
        <li><strong>Munezero</strong> (${PAID_PAYOUTS[0].id}): PAID $${paidResults[0]?.netAmount?.toFixed(2) ?? '128.93'} USDT — manual TRC20</li>
        <li><strong>KezC</strong> (${PAID_PAYOUTS[1].id}): PAID $${paidResults[1]?.netAmount?.toFixed(2) ?? '110.13'} USDT — manual TRC20</li>
        <li><strong>Uwiduhaye Diane</strong> (${UWIDUHAye.payoutId}): PENDING — shared wallet blocked; user emailed</li>
      </ul>
    </body></html>`;
    const adminText = `Munezero PAID, KezC PAID, Uwiduhaye PENDING (shared wallet).`;
    await sendEmail(ADMIN_EMAIL, adminSubject, adminHtml, adminText);
    marker.adminCopy = { sentAt: new Date().toISOString(), subject: adminSubject };
  }

  writeMarker(marker);

  console.log(
    JSON.stringify(
      {
        paidResults,
        uwiduhaye,
        adminCopyTo: ADMIN_EMAIL,
        markerPath,
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
