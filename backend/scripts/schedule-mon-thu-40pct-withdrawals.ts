/**
 * Trade Guard only: pay 40% of each PENDING wallet withdrawal, refund 60% to
 * wallet, schedule smallest-first from Mon 21 Sep 2026 19:00 EAT every 4h
 * through Thu 24 Sep 19:00 EAT, email each user their slot, email the list
 * to willeratmit12@gmail.com.
 *
 * Usage: cd backend && npx tsx scripts/schedule-mon-thu-40pct-withdrawals.ts
 *        DRY_RUN=1 cd backend && npx tsx scripts/schedule-mon-thu-40pct-withdrawals.ts
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { formatKampalaDateTime } from '../src/payouts/sunday-withdraw-batch.util';

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
const resendKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const adminEmail =
  process.env.ADMIN_EMAIL?.trim() || 'willeratmit12@gmail.com';
const frontendUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://thetradeguard.com';
const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const SENT_PATH = resolve(
  __dirname,
  '.sent-mon-thu-40pct-withdrawals.json',
);
const NOTE_MARK = 'Mon–Thu 40% dispatch';
const FIRST_UTC = new Date('2026-09-21T16:00:00.000Z'); // Mon 19:00 Africa/Kampala
const INTERVAL_MS = 4 * 60 * 60 * 1000;
const PAY_FRACTION = 0.4;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function compactNotes(notes: string | null): string {
  return (notes ?? '')
    .replace(/ — Sunday batch approve failed:[^—]*/g, '')
    .replace(/\s*— Mon–Thu 40% dispatch[^—]*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatKampalaWhen(date: Date) {
  return date.toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
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
    where: { email: 'nelysa2020@gmail.com' },
    select: { id: true },
  });
  if (!probe) {
    throw new Error(
      'nelysa2020@gmail.com not found — refuse to run (wrong DB / Soloema?)',
    );
  }

  const payouts = await prisma.payout.findMany({
    where: {
      status: 'PENDING',
      source: 'DEPOSITOR',
      walletAddress: { not: null },
      OR: [{ payoutMethod: null }, { payoutMethod: { not: 'MOBILE_MONEY' } }],
      momoP2p: { is: null },
    },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: [{ traderShare: 'asc' }, { requestedAt: 'asc' }],
  });

  if (payouts.length === 0) {
    throw new Error('No PENDING Trade Guard wallet withdrawals');
  }

  type Row = {
    pos: number;
    payoutId: string;
    userId: string;
    name: string;
    email: string | null;
    wallet: string;
    originalNet: number;
    payAmount: number;
    refunded: number;
    scheduled: Date;
    alreadyApplied: boolean;
    userEmailed: boolean;
    userEmailError?: string;
  };

  const rows: Row[] = [];

  for (let i = 0; i < payouts.length; i++) {
    const p = payouts[i];
    const scheduled = new Date(FIRST_UTC.getTime() + i * INTERVAL_MS);
    const alreadyApplied = (p.notes ?? '').includes(NOTE_MARK);
    const originalNet = alreadyApplied
      ? money(Number(p.traderShare) / PAY_FRACTION)
      : money(Number(p.traderShare));
    const payAmount = money(originalNet * PAY_FRACTION);
    const refunded = money(originalNet - payAmount);
    const platformShare = money(Number(p.platformShare));

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        if (!alreadyApplied) {
          const wallet = await tx.platformWallet.findUnique({
            where: { userId: p.userId },
          });
          if (!wallet) {
            throw new Error(`No platform wallet for ${p.user.email}`);
          }
          const refundRef = `withdraw_40pct_holdback_${p.id}`;
          const existing = await tx.walletTransaction.findFirst({
            where: { referenceId: refundRef },
          });
          if (!existing && refunded > 0) {
            const newBalance = money(Number(wallet.availableBalance) + refunded);
            await tx.platformWallet.update({
              where: { userId: p.userId },
              data: { availableBalance: newBalance },
            });
            await tx.walletTransaction.create({
              data: {
                userId: p.userId,
                amount: refunded,
                type: 'ADJUSTMENT',
                description: `Withdrawal holdback returned to wallet (60% of $${originalNet.toFixed(2)} USDT). $${payAmount.toFixed(2)} USDT remains queued for payout.`,
                referenceId: refundRef,
                balanceAfter: newBalance,
              },
            });
          }
          await tx.payout.update({
            where: { id: p.id },
            data: {
              traderShare: payAmount,
              platformShare: money(platformShare + refunded),
              scheduledApproveAt: scheduled,
              sundayBatchEtaNotifiedAt: null,
              notes: `${compactNotes(p.notes)} — ${NOTE_MARK}: net $${originalNet.toFixed(2)} → send $${payAmount.toFixed(2)} USDT; $${refunded.toFixed(2)} returned to wallet; ${formatKampalaDateTime(scheduled)} Kampala`.trim(),
            },
          });
        } else {
          await tx.payout.update({
            where: { id: p.id },
            data: { scheduledApproveAt: scheduled },
          });
        }
      });
    }

    rows.push({
      pos: i + 1,
      payoutId: p.id,
      userId: p.user.id,
      name: p.user.displayName,
      email: p.user.email,
      wallet: p.walletAddress!,
      originalNet,
      payAmount,
      refunded,
      scheduled,
      alreadyApplied,
      userEmailed: false,
    });
  }

  if (!dryRun) {
    await prisma.platformConfig.update({
      where: { id: 'default' },
      data: {
        sundayWithdrawBatchFinalizedAt: null,
        sundayWithdrawBatchScheduleNotifiedAt: new Date(),
      },
    });
  }

  if (!dryRun) {
    for (const row of rows) {
      if (!row.email) continue;
      const when = formatKampalaWhen(row.scheduled);
      const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">Your withdrawal send time</h1>
    <p>Hi ${escapeHtml(row.name)},</p>
    <p>Your pending withdrawal is in this week&apos;s payout queue.</p>
    <p>Amount that will be sent: <strong>$${row.payAmount.toFixed(2)} USDT</strong> (40% of your queued net $${row.originalNet.toFixed(2)} USDT).</p>
    <p>The remaining <strong>$${row.refunded.toFixed(2)} USDT</strong> is back in your Trade Guard wallet.</p>
    <p><strong>Send time:</strong> ${escapeHtml(when)} <span style="color:#94a3b8;">(Africa/Kampala)</span></p>
    <p style="color:#94a3b8;font-size:14px;">Payouts go out one at a time, every 4 hours, smallest amounts first, from Monday 19:00 through Thursday 19:00 Kampala time. You will get another email when the transfer is submitted.</p>
    <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a></p>
  </div></body></html>`;
      const text = `Hi ${row.name}, your Trade Guard withdrawal of $${row.payAmount.toFixed(2)} USDT (40% of $${row.originalNet.toFixed(2)}) is scheduled for ${when} Africa/Kampala. $${row.refunded.toFixed(2)} USDT was returned to your wallet.`;
      try {
        await sendEmail(
          row.email,
          `Withdrawal send time — ${when} Kampala`,
          html,
          text,
        );
        row.userEmailed = true;
      } catch (err) {
        row.userEmailed = false;
        row.userEmailError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const totalOriginal = rows.reduce((s, r) => s + r.originalNet, 0);
  const totalPay = rows.reduce((s, r) => s + r.payAmount, 0);
  const totalRefund = rows.reduce((s, r) => s + r.refunded, 0);
  const first = rows[0].scheduled;
  const last = rows[rows.length - 1].scheduled;

  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #334155;">#${r.pos}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.name)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.email ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.originalNet.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>$${r.payAmount.toFixed(2)}</strong></td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.refunded.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;font-family:monospace;font-size:11px;">${escapeHtml(r.wallet.slice(0, 10))}…</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>${escapeHtml(formatKampalaWhen(r.scheduled))}</strong></td>
        </tr>`,
    )
    .join('');

  const textLines = rows
    .map(
      (r) =>
        `#${r.pos} ${r.name} (${r.email ?? '—'}) queued $${r.originalNet.toFixed(2)} → send $${r.payAmount.toFixed(2)} refund $${r.refunded.toFixed(2)} ${r.wallet} @ ${formatKampalaWhen(r.scheduled)} EAT`,
    )
    .join('\n');

  const adminHtml = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
<div style="max-width:960px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
<h1 style="color:#fff;font-size:20px">Trade Guard payout list — 40% / 4 hours</h1>
<p>${rows.length} pending wallet withdrawals. Pay <strong>40%</strong> of each queued net, refund 60% to wallet, smallest first, <strong>4 hours</strong> between sends.</p>
<p>First: <strong>${escapeHtml(formatKampalaWhen(first))} EAT</strong> · Last: <strong>${escapeHtml(formatKampalaWhen(last))} EAT</strong></p>
<p>Queued net <strong>$${totalOriginal.toFixed(2)}</strong> · Send now <strong>$${totalPay.toFixed(2)}</strong> · Returned to wallets <strong>$${totalRefund.toFixed(2)}</strong> USDT</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
<thead><tr style="color:#94a3b8;text-align:left">
<th style="padding:8px">#</th><th style="padding:8px">User</th><th style="padding:8px">Email</th>
<th style="padding:8px">Queued net</th><th style="padding:8px">Send (40%)</th><th style="padding:8px">Wallet refund (60%)</th>
<th style="padding:8px">Wallet</th><th style="padding:8px">Send time (Kampala)</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
</div></body></html>`;

  if (!dryRun) {
    await sendEmail(
      adminEmail,
      `[Trade Guard] ${rows.length} withdrawals — $${totalPay.toFixed(2)} USDT at 40%, Mon 19:00–Thu 19:00 EAT`,
      adminHtml,
      `Trade Guard 40% payout schedule (${rows.length})\nFirst: ${formatKampalaWhen(first)} EAT\nLast: ${formatKampalaWhen(last)} EAT\nSend: $${totalPay.toFixed(2)} · Refunded: $${totalRefund.toFixed(2)}\n\n${textLines}`,
    );
    writeFileSync(
      SENT_PATH,
      JSON.stringify(
        {
          sentAt: new Date().toISOString(),
          adminEmail,
          count: rows.length,
          totalPay,
          totalRefund,
          rows: rows.map((r) => ({
            pos: r.pos,
            name: r.name,
            email: r.email,
            payAmount: r.payAmount,
            refunded: r.refunded,
            scheduledEat: formatKampalaWhen(r.scheduled),
            userEmailed: r.userEmailed,
            userEmailError: r.userEmailError ?? null,
          })),
        },
        null,
        2,
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        count: rows.length,
        totalOriginal: totalOriginal.toFixed(2),
        totalPay: totalPay.toFixed(2),
        totalRefund: totalRefund.toFixed(2),
        firstEat: formatKampalaWhen(first),
        lastEat: formatKampalaWhen(last),
        adminEmail,
        userEmailsFailed: rows.filter((r) => r.email && !r.userEmailed && !dryRun)
          .length,
        schedule: rows.map((r) => ({
          pos: r.pos,
          name: r.name,
          email: r.email,
          originalNet: r.originalNet.toFixed(2),
          payAmount: r.payAmount.toFixed(2),
          refunded: r.refunded.toFixed(2),
          scheduledEat: formatKampalaWhen(r.scheduled),
          alreadyApplied: r.alreadyApplied,
          userEmailed: r.userEmailed,
          userEmailError: r.userEmailError ?? null,
        })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
