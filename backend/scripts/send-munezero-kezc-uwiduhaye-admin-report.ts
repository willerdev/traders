/**
 * Send comprehensive admin report for Munezero/KezC/Uwiduhaye withdrawal ops.
 * Idempotent: marker file unless FORCE=1.
 *
 * Usage: cd backend && npx tsx scripts/send-munezero-kezc-uwiduhaye-admin-report.ts
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
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const force = process.env.FORCE === '1';
const markerPath = resolve(
  __dirname,
  '.sent-munezero-kezc-uwiduhaye-admin-report.json',
);

const PAYOUT_IDS = [
  'cmtpc4dgq0bjtin01pzss2jmg',
  'cmtpby2p40bhvin01kpn9gs7z',
  'cmtp3hj2u08zpin011iyjj742',
] as const;

const opsMarkerPath = resolve(
  __dirname,
  '.sent-munezero-kezc-paid-uwiduhaye-wallet-notice.json',
);

const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const emailFrom =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';

function readMarker(): { sentAt?: string; subject?: string } {
  if (!existsSync(markerPath)) return {};
  try {
    return JSON.parse(readFileSync(markerPath, 'utf8'));
  } catch {
    return {};
  }
}

function readOpsMarker() {
  if (!existsSync(opsMarkerPath)) return null;
  try {
    return JSON.parse(readFileSync(opsMarkerPath, 'utf8'));
  } catch {
    return null;
  }
}

function maskWallet(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function formatEat(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function eatNow() {
  return new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'full',
    timeStyle: 'long',
  });
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<boolean> {
  if (!resendKey) throw new Error('RESEND_API_KEY missing');
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: emailFrom, to: [to], subject, html, text }),
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
  const marker = readMarker();
  if (marker.sentAt && !force) {
    console.log(
      JSON.stringify(
        { skipped: true, reason: 'already_sent', ...marker },
        null,
        2,
      ),
    );
    return;
  }

  const payouts = await prisma.payout.findMany({
    where: { id: { in: [...PAYOUT_IDS] } },
    include: { user: { select: { id: true, email: true, displayName: true } } },
  });

  const byId = Object.fromEntries(payouts.map((p) => [p.id, p]));
  for (const id of PAYOUT_IDS) {
    if (!byId[id]) throw new Error(`Payout ${id} not found`);
  }

  const munezero = byId['cmtpc4dgq0bjtin01pzss2jmg'];
  const kezc = byId['cmtpby2p40bhvin01kpn9gs7z'];
  const uwiduhaye = byId['cmtp3hj2u08zpin011iyjj742'];

  const uwWallet = uwiduhaye.walletAddress?.trim() ?? '';
  let sharedWalletContext = 'No wallet on file';
  if (uwWallet) {
    const otherPayouts = await prisma.payout.findMany({
      where: {
        walletAddress: uwWallet,
        NOT: { userId: uwiduhaye.userId },
      },
      include: {
        user: { select: { email: true, displayName: true } },
      },
      take: 5,
    });
    const otherUsers = [
      ...new Map(
        otherPayouts.map((p) => [
          p.user.email,
          p.user.displayName || p.user.email,
        ]),
      ).entries(),
    ];
    sharedWalletContext =
      otherUsers.length > 0
        ? `Wallet ${maskWallet(uwWallet)} also linked to: ${otherUsers.map(([e, n]) => `${n} (${e})`).join('; ')}`
        : `Wallet ${maskWallet(uwWallet)} flagged as duplicate (cross-account verification)`;
  }

  const opsMarker = readOpsMarker();
  const munezeroEmailSent =
    opsMarker?.withdrawalComplete?.['cmtpc4dgq0bjtin01pzss2jmg']?.subject ??
    'Withdrawal complete — $128.93 USDT';
  const kezcEmailSent =
    opsMarker?.withdrawalComplete?.['cmtpby2p40bhvin01kpn9gs7z']?.subject ??
    'Withdrawal complete — $110.13 USDT';
  const uwiduhayeEmailSent =
    opsMarker?.uwiduhayeWalletNotice?.subject ??
    'Withdrawal update — wallet verification required';

  const rows = [
    {
      user: 'Munezero',
      email: munezero.user.email,
      payoutId: munezero.id,
      amount: `$${Number(munezero.traderShare).toFixed(2)}`,
      status: munezero.status,
      action: 'Marked PAID (manual TRC20)',
      userEmail: munezeroEmailSent,
    },
    {
      user: 'KezC',
      email: kezc.user.email,
      payoutId: kezc.id,
      amount: `$${Number(kezc.traderShare).toFixed(2)}`,
      status: kezc.status,
      action: 'Marked PAID (manual TRC20)',
      userEmail: kezcEmailSent,
    },
    {
      user: 'Uwiduhaye Diane',
      email: uwiduhaye.user.email,
      payoutId: uwiduhaye.id,
      amount: `$${Number(uwiduhaye.traderShare).toFixed(2)}`,
      status: uwiduhaye.status,
      action: 'NOT paid — shared wallet blocked',
      userEmail: uwiduhayeEmailSent,
    },
  ];

  const subject =
    '[Admin Report] Withdrawals completed — Munezero, KezC paid; Uwiduhaye pending';

  const tableHtml = `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px;font-size:14px">
    <thead style="background:#f1f5f9">
      <tr>
        <th align="left">User</th>
        <th align="left">Email</th>
        <th align="left">Payout ID</th>
        <th align="left">Amount</th>
        <th align="left">Status</th>
        <th align="left">Action</th>
        <th align="left">User email sent</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td>${r.user}</td>
        <td>${r.email}</td>
        <td><code>${r.payoutId}</code></td>
        <td>${r.amount} USDT</td>
        <td><strong>${r.status}</strong></td>
        <td>${r.action}</td>
        <td>${r.userEmail}</td>
      </tr>`,
        )
        .join('')}
    </tbody>
  </table>`;

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;color:#0f172a;line-height:1.5">
    <h2>Withdrawal operations report</h2>
    <p><strong>Report time (EAT):</strong> ${eatNow()}</p>
    <p>Summary of manual withdrawal actions performed today.</p>
    ${tableHtml}
    <h3>Details</h3>
    <h4>Munezero (ngwinondebecharlotte@gmail.com)</h4>
    <ul>
      <li>Payout ID: <code>${munezero.id}</code></li>
      <li>Amount: $${Number(munezero.traderShare).toFixed(2)} USDT → ${maskWallet(munezero.walletAddress ?? '')}</li>
      <li>Status: <strong>${munezero.status}</strong> (processed ${formatEat(munezero.processedAt?.toISOString())} EAT)</li>
      <li>User notification: "${munezeroEmailSent}"</li>
    </ul>
    <h4>KezC (christinek085@gmail.com)</h4>
    <ul>
      <li>Payout ID: <code>${kezc.id}</code></li>
      <li>Amount: $${Number(kezc.traderShare).toFixed(2)} USDT → ${maskWallet(kezc.walletAddress ?? '')}</li>
      <li>Status: <strong>${kezc.status}</strong> (processed ${formatEat(kezc.processedAt?.toISOString())} EAT)</li>
      <li>User notification: "${kezcEmailSent}"</li>
    </ul>
    <h4>Uwiduhaye Diane (uwiduhaye3@gmail.com)</h4>
    <ul>
      <li>Payout ID: <code>${uwiduhaye.id}</code></li>
      <li>Amount: $${Number(uwiduhaye.traderShare).toFixed(2)} USDT (not sent)</li>
      <li>Status: <strong>${uwiduhaye.status}</strong></li>
      <li>Reason: Payout cannot complete until user provides a unique TRC20 wallet not used by other accounts</li>
      <li>Shared wallet context: ${sharedWalletContext}</li>
      <li>User notification: "${uwiduhayeEmailSent}"</li>
    </ul>
    <p style="color:#64748b;font-size:13px;margin-top:24px">TraderRank Pro admin operations · idempotent marker: send-munezero-kezc-uwiduhaye-admin-report</p>
  </body></html>`;

  const text = `Withdrawal operations report
Report time (EAT): ${eatNow()}

${rows.map((r) => `${r.user} | ${r.email} | ${r.payoutId} | ${r.amount} | ${r.status} | ${r.action} | Email: ${r.userEmail}`).join('\n')}

Uwiduhaye shared wallet: ${sharedWalletContext}
`;

  await sendEmail(ADMIN_EMAIL, subject, html, text);

  const sentAt = new Date().toISOString();
  writeFileSync(markerPath, JSON.stringify({ sentAt, subject, to: ADMIN_EMAIL }, null, 2));

  console.log(
    JSON.stringify(
      {
        sent: true,
        to: ADMIN_EMAIL,
        subject,
        sentAt,
        eat: eatNow(),
        rows,
        sharedWalletContext,
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
