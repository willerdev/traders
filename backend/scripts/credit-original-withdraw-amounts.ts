/**
 * Trade Guard: top up wallets so each Mon–Thu 40% payout has the original
 * withdrawn gross credited back (on top of the 60% net already returned).
 * 40% send amounts and schedule stay unchanged.
 *
 * Usage: cd backend && npx tsx scripts/credit-original-withdraw-amounts.ts
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
const SENT_PATH = resolve(
  __dirname,
  '.sent-credit-original-withdraw-amounts.json',
);
const NOTE_MARK = 'Mon–Thu 40% dispatch';

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
      notes: { contains: NOTE_MARK },
    },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { scheduledApproveAt: 'asc' },
  });

  if (payouts.length === 0) {
    throw new Error('No Mon–Thu 40% dispatch payouts found');
  }

  type Row = {
    pos: number;
    payoutId: string;
    userId: string;
    name: string;
    email: string | null;
    originalGross: number;
    alreadyRefunded: number;
    extraCredit: number;
    skipped: boolean;
    sendAmount: number;
    scheduled: Date | null;
    walletAfter: number | null;
  };

  const rows: Row[] = [];

  for (let i = 0; i < payouts.length; i++) {
    const p = payouts[i];
    const originalGross = money(Number(p.virtualProfit));
    const sendAmount = money(Number(p.traderShare));
    const holdbackRef = `withdraw_40pct_holdback_${p.id}`;
    const restoreRef = `withdraw_restore_original_gross_${p.id}`;

    const holdback = await prisma.walletTransaction.findFirst({
      where: { referenceId: holdbackRef },
    });
    const alreadyRefunded = money(Number(holdback?.amount ?? 0));
    const extraCredit = money(Math.max(0, originalGross - alreadyRefunded));

    const existingRestore = await prisma.walletTransaction.findFirst({
      where: { referenceId: restoreRef },
    });

    let skipped = Boolean(existingRestore) || extraCredit <= 0;
    let walletAfter: number | null = null;

    if (!skipped) {
      await prisma.$transaction(async (tx) => {
        const wallet = await tx.platformWallet.findUnique({
          where: { userId: p.userId },
        });
        if (!wallet) throw new Error(`No wallet for ${p.user.email}`);
        const newBalance = money(Number(wallet.availableBalance) + extraCredit);
        await tx.platformWallet.update({
          where: { userId: p.userId },
          data: { availableBalance: newBalance },
        });
        await tx.walletTransaction.create({
          data: {
            userId: p.userId,
            amount: extraCredit,
            type: 'ADJUSTMENT',
            description: `Original withdrawal $${originalGross.toFixed(2)} USDT returned to wallet. $${sendAmount.toFixed(2)} USDT remains queued (40% send).`,
            referenceId: restoreRef,
            balanceAfter: newBalance,
          },
        });
        await tx.payout.update({
          where: { id: p.id },
          data: {
            notes: `${p.notes ?? ''} — Original withdrawn $${originalGross.toFixed(2)} credited to wallet (extra $${extraCredit.toFixed(2)})`.trim(),
          },
        });
        walletAfter = newBalance;
      });
    } else {
      const wallet = await prisma.platformWallet.findUnique({
        where: { userId: p.userId },
      });
      walletAfter = wallet ? money(Number(wallet.availableBalance)) : null;
    }

    rows.push({
      pos: i + 1,
      payoutId: p.id,
      userId: p.userId,
      name: p.user.displayName,
      email: p.user.email,
      originalGross,
      alreadyRefunded,
      extraCredit: existingRestore ? 0 : extraCredit,
      skipped,
      sendAmount,
      scheduled: p.scheduledApproveAt,
      walletAfter,
    });
  }

  const byUser = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.email || row.userId;
    const list = byUser.get(key) ?? [];
    list.push(row);
    byUser.set(key, list);
  }

  const userEmailResults: Array<{
    email: string;
    sent: boolean;
    error?: string;
  }> = [];

  for (const [, list] of byUser) {
    const email = list[0].email;
    if (!email) continue;
    const name = list[0].name;
    const totalGross = money(list.reduce((s, r) => s + r.originalGross, 0));
    const totalExtra = money(list.reduce((s, r) => s + r.extraCredit, 0));
    const lines = list
      .map((r) => {
        const when = r.scheduled ? formatKampalaWhen(r.scheduled) : 'scheduled';
        return `<li>Original withdrawn <strong>$${r.originalGross.toFixed(2)}</strong> USDT is in your wallet. 40% send <strong>$${r.sendAmount.toFixed(2)}</strong> USDT still goes out ${escapeHtml(when)} (Africa/Kampala).</li>`;
      })
      .join('');
    const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">Original withdrawal returned</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>The original amount you withdrew is back in your Trade Guard wallet (total <strong>$${totalGross.toFixed(2)} USDT</strong>).</p>
    <ul>${lines}</ul>
    <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a></p>
  </div></body></html>`;
    const text = `Hi ${name}, your original withdrawal totaling $${totalGross.toFixed(2)} USDT is back in your Trade Guard wallet. The 40% send times are unchanged.`;
    try {
      await sendEmail(
        email,
        `Original withdrawal $${totalGross.toFixed(2)} USDT returned to wallet`,
        html,
        text,
      );
      userEmailResults.push({ email, sent: true });
    } catch (err) {
      userEmailResults.push({
        email,
        sent: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totalGross = money(rows.reduce((s, r) => s + r.originalGross, 0));
  const totalExtra = money(rows.reduce((s, r) => s + r.extraCredit, 0));
  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #334155;">#${r.pos}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.name)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.email ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.originalGross.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.alreadyRefunded.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>$${r.extraCredit.toFixed(2)}</strong></td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.sendAmount.toFixed(2)}</td>
        </tr>`,
    )
    .join('');

  const adminHtml = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
<div style="max-width:900px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
<h1 style="color:#fff;font-size:20px">Original withdrawn amounts credited</h1>
<p>Wallets topped up so each payout has the <strong>original withdrawn gross</strong> back. Extra credited now: <strong>$${totalExtra.toFixed(2)}</strong> USDT. Original gross across ${rows.length} payouts: $${totalGross.toFixed(2)}. 40% send schedule unchanged.</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
<thead><tr style="color:#94a3b8;text-align:left">
<th style="padding:8px">#</th><th style="padding:8px">User</th><th style="padding:8px">Email</th>
<th style="padding:8px">Original withdrawn</th><th style="padding:8px">Already refunded (60%)</th>
<th style="padding:8px">Extra credited</th><th style="padding:8px">Still sending (40%)</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
</div></body></html>`;

  await sendEmail(
    adminEmail,
    `[Trade Guard] Original withdrawals credited — extra $${totalExtra.toFixed(2)} USDT`,
    adminHtml,
    `Original withdrawn amounts credited. Extra now: $${totalExtra.toFixed(2)}. Gross: $${totalGross.toFixed(2)}. 40% schedule unchanged.`,
  );

  writeFileSync(
    SENT_PATH,
    JSON.stringify(
      {
        sentAt: new Date().toISOString(),
        totalGross,
        totalExtra,
        rows,
        userEmailResults,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        count: rows.length,
        totalGross: totalGross.toFixed(2),
        totalExtra: totalExtra.toFixed(2),
        skipped: rows.filter((r) => r.skipped).length,
        userEmailsFailed: userEmailResults.filter((r) => !r.sent).length,
        rows: rows.map((r) => ({
          pos: r.pos,
          name: r.name,
          email: r.email,
          originalGross: r.originalGross.toFixed(2),
          extraCredit: r.extraCredit.toFixed(2),
          skipped: r.skipped,
          sendAmount: r.sendAmount.toFixed(2),
          walletAfter: r.walletAfter,
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
