/**
 * Email Smart Invest users whose lifetime INVESTOR_EARNING >= total INVESTOR_ALLOCATE.
 *
 * Usage:
 *   cd backend && npx tsx scripts/email-smart-invest-profit-gte-invest-report.ts
 *   cd backend && FORCE=1 npx tsx scripts/email-smart-invest-profit-gte-invest-report.ts
 */
import { PrismaClient, WalletTxType } from '@prisma/client';
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
const recipient = 'willeratmit12@gmail.com';
const force = process.env.FORCE === '1';
const markerPath = resolve(
  __dirname,
  '.sent-smart-invest-profit-gte-invest-report.json',
);

type Row = {
  name: string;
  email: string;
  invested: number;
  profits: number;
  balance: number;
  ratio: number;
};

function fmt(n: number) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtRatio(r: number) {
  return `${r.toFixed(2)}×`;
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
  <div style="max-width:720px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px;margin:0 0 8px">${escapeHtml(title)}</h1>
    ${body}
  </div></body></html>`;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
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
      if (res.ok) return;
      lastErr = await res.text();
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 400));
  }
  throw new Error(lastErr);
}

async function queryRows(): Promise<{
  rows: Row[];
  totalUsers: number;
  snapshotAt: Date;
}> {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ investorActive: true }, { investorEnrolledAt: { not: null } }],
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      platformWallet: { select: { investorBalance: true } },
    },
    orderBy: [{ investorEnrolledAt: 'asc' }, { email: 'asc' }],
  });

  const userIds = users.map((u) => u.id);
  const aggregates = await prisma.walletTransaction.groupBy({
    by: ['userId', 'type'],
    where: {
      type: { in: ['INVESTOR_ALLOCATE', 'INVESTOR_EARNING'] as WalletTxType[] },
      userId: { in: userIds },
    },
    _sum: { amount: true },
  });

  const byUser = new Map<string, { invested: number; profits: number }>();
  for (const row of aggregates) {
    const current = byUser.get(row.userId) ?? { invested: 0, profits: 0 };
    const amount = Math.abs(Number(row._sum.amount ?? 0));
    if (row.type === 'INVESTOR_ALLOCATE') current.invested += amount;
    if (row.type === 'INVESTOR_EARNING') current.profits += amount;
    byUser.set(row.userId, current);
  }

  const rows: Row[] = [];
  for (const user of users) {
    const totals = byUser.get(user.id) ?? { invested: 0, profits: 0 };
    const invested = Math.round(totals.invested * 100) / 100;
    const profits = Math.round(totals.profits * 100) / 100;
    if (profits < invested || invested <= 0) continue;
    rows.push({
      name: user.displayName?.trim() || user.email,
      email: user.email,
      invested,
      profits,
      balance:
        Math.round(Number(user.platformWallet?.investorBalance ?? 0) * 100) / 100,
      ratio: invested > 0 ? profits / invested : 0,
    });
  }

  rows.sort((a, b) => b.ratio - a.ratio);
  return { rows, totalUsers: users.length, snapshotAt: new Date() };
}

function buildEmail(
  rows: Row[],
  totalUsers: number,
  snapshotAt: Date,
) {
  const snapshotLabel = snapshotAt.toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const totalInvested = rows.reduce((s, r) => s + r.invested, 0);
  const totalProfits = rows.reduce((s, r) => s + r.profits, 0);

  const tableRows = rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 === 0 ? '#0f172a' : '#1e293b'}">
          <td style="padding:8px 10px;border-bottom:1px solid #334155">${escapeHtml(r.name)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #334155;font-size:13px;color:#94a3b8">${escapeHtml(r.email)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #334155;text-align:right">$${fmt(r.invested)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #334155;text-align:right">$${fmt(r.profits)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #334155;text-align:right">$${fmt(r.balance)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #334155;text-align:right">${fmtRatio(r.ratio)}</td>
        </tr>`,
    )
    .join('');

  const html = layout(
    'Smart Invest — profits ≥ investment',
    `<p style="color:#94a3b8;font-size:14px;margin:0 0 16px">Snapshot: ${escapeHtml(snapshotLabel)} (Kampala, UTC+3)</p>
    <p>Users whose lifetime <strong>INVESTOR_EARNING</strong> is greater than or equal to total <strong>INVESTOR_ALLOCATE</strong>.</p>
    <p style="margin:16px 0"><strong>${rows.length}</strong> of <strong>${totalUsers}</strong> enrolled Smart Invest users · <strong>$${fmt(totalInvested)}</strong> invested · <strong>$${fmt(totalProfits)}</strong> lifetime profits</p>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#334155;color:#fff">
            <th style="padding:10px;text-align:left">Name</th>
            <th style="padding:10px;text-align:left">Email</th>
            <th style="padding:10px;text-align:right">Invested</th>
            <th style="padding:10px;text-align:right">Profits</th>
            <th style="padding:10px;text-align:right">Balance</th>
            <th style="padding:10px;text-align:right">Ratio</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr style="background:#334155;font-weight:600">
            <td colspan="2" style="padding:10px">Totals (${rows.length} users)</td>
            <td style="padding:10px;text-align:right">$${fmt(totalInvested)}</td>
            <td style="padding:10px;text-align:right">$${fmt(totalProfits)}</td>
            <td colspan="2" style="padding:10px"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p style="color:#64748b;font-size:12px;margin-top:20px;line-height:1.6">
      <strong>Methodology:</strong> Invested = sum of absolute <code>INVESTOR_ALLOCATE</code> amounts.
      Profits = sum of absolute <code>INVESTOR_EARNING</code> daily credits.
      Balance = current Smart Invest balance on platform wallet.
      Ratio = profits ÷ invested.
      Scope = users with <code>investorActive</code> or <code>investorEnrolledAt</code> set.
    </p>`,
  );

  const textLines = [
    `Smart Invest — profits ≥ investment (${snapshotLabel})`,
    `${rows.length} of ${totalUsers} users · $${fmt(totalInvested)} invested · $${fmt(totalProfits)} profits`,
    '',
    'Name | Email | Invested | Profits | Balance | Ratio',
    ...rows.map(
      (r) =>
        `${r.name} | ${r.email} | $${fmt(r.invested)} | $${fmt(r.profits)} | $${fmt(r.balance)} | ${fmtRatio(r.ratio)}`,
    ),
  ];

  const subject = `Smart Invest report: ${rows.length} users with profits ≥ investment (${snapshotLabel.slice(0, 11)})`;

  return { subject, html, text: textLines.join('\n'), totalInvested, totalProfits };
}

async function main() {
  if (existsSync(markerPath) && !force) {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as {
      sentAt: string;
      recipient: string;
      subject: string;
    };
    console.log(
      JSON.stringify(
        {
          skipped: true,
          ...marker,
          hint: 'Set FORCE=1 to send again',
        },
        null,
        2,
      ),
    );
    return;
  }

  const { rows, totalUsers, snapshotAt } = await queryRows();
  const { subject, html, text, totalInvested, totalProfits } = buildEmail(
    rows,
    totalUsers,
    snapshotAt,
  );

  await sendEmail(recipient, subject, html, text);

  const marker = {
    sentAt: snapshotAt.toISOString(),
    recipient,
    subject,
    userCount: rows.length,
    totalUsers,
    totalInvested,
    totalProfits,
  };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2));

  console.log(
    JSON.stringify(
      {
        sent: true,
        recipient,
        subject,
        userCount: rows.length,
        totalUsers,
        totalInvested,
        totalProfits,
        rows,
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
