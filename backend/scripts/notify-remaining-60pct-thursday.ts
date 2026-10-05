/**
 * Tell Trade Guard users on the Mon–Thu 40% batch that the remaining 60%
 * will be sent from Thursday this week (24 Sep 2026).
 *
 * Usage: cd backend && npx tsx scripts/notify-remaining-60pct-thursday.ts
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
  '.sent-remaining-60pct-thursday.json',
);
const NOTE_MARK = 'Mon–Thu 40% dispatch';
const THURSDAY_LABEL = 'Thursday 24 September 2026';

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
  if (existsSync(SENT_PATH)) {
    console.log(
      JSON.stringify(
        { skipped: true, reason: 'already_sent', path: SENT_PATH },
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    return;
  }

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

  type Item = {
    send40: number;
    rest60: number;
    scheduled: Date | null;
  };
  type UserRow = {
    userId: string;
    name: string;
    email: string;
    items: Item[];
    total40: number;
    total60: number;
    emailed: boolean;
    error?: string;
  };

  const byEmail = new Map<string, UserRow>();
  for (const p of payouts) {
    const email = p.user.email?.trim().toLowerCase();
    if (!email) continue;
    const send40 = money(Number(p.traderShare));
    const rest60 = money(send40 * 1.5);
    const item: Item = {
      send40,
      rest60,
      scheduled: p.scheduledApproveAt,
    };
    const existing = byEmail.get(email);
    if (existing) {
      existing.items.push(item);
      existing.total40 = money(existing.total40 + send40);
      existing.total60 = money(existing.total60 + rest60);
    } else {
      byEmail.set(email, {
        userId: p.userId,
        name: p.user.displayName,
        email,
        items: [item],
        total40: send40,
        total60: rest60,
        emailed: false,
      });
    }
  }

  const users = [...byEmail.values()];

  for (const user of users) {
    const itemLines = user.items
      .map((item) => {
        const when = item.scheduled
          ? formatKampalaWhen(item.scheduled)
          : 'your scheduled slot';
        return `<li>40% send: <strong>$${item.send40.toFixed(2)} USDT</strong> at ${escapeHtml(when)} (Africa/Kampala). Remaining 60%: <strong>$${item.rest60.toFixed(2)} USDT</strong>.</li>`;
      })
      .join('');
    const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
    <h1 style="color:#fff;font-size:20px">Remaining 60% from Thursday</h1>
    <p>Hi ${escapeHtml(user.name)},</p>
    <p>This week we are sending <strong>40%</strong> of your queued withdrawal first. The remaining <strong>60% ($${user.total60.toFixed(2)} USDT)</strong> will be sent <strong>from ${THURSDAY_LABEL}</strong> (Africa/Kampala).</p>
    <ul>${itemLines}</ul>
    <p>You will get another email when each transfer is submitted.</p>
    <p><a href="${frontendUrl}/wallet" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View wallet</a></p>
  </div></body></html>`;
    const text = `Hi ${user.name}, the remaining 60% of your withdrawal ($${user.total60.toFixed(2)} USDT) will be sent from ${THURSDAY_LABEL} (Africa/Kampala). Your 40% amount this week is $${user.total40.toFixed(2)} USDT.`;
    try {
      await sendEmail(
        user.email,
        `Remaining 60% ($${user.total60.toFixed(2)} USDT) from Thursday this week`,
        html,
        text,
      );
      user.emailed = true;
    } catch (err) {
      user.emailed = false;
      user.error = err instanceof Error ? err.message : String(err);
    }
  }

  const total60 = money(users.reduce((s, u) => s + u.total60, 0));
  const table = users
    .map(
      (u) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(u.name)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(u.email)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${u.total40.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>$${u.total60.toFixed(2)}</strong></td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${u.emailed ? 'sent' : 'FAILED'}</td>
        </tr>`,
    )
    .join('');

  await sendEmail(
    adminEmail,
    `[Trade Guard] Told users remaining 60% starts Thursday — $${total60.toFixed(2)} USDT`,
    `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
<div style="max-width:720px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
<h1 style="color:#fff;font-size:20px">Remaining 60% notice sent</h1>
<p>${users.length} users were told the remaining 60% (total <strong>$${total60.toFixed(2)} USDT</strong>) will be sent from <strong>${THURSDAY_LABEL}</strong>.</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
<thead><tr style="color:#94a3b8;text-align:left">
<th style="padding:8px">User</th><th style="padding:8px">Email</th>
<th style="padding:8px">40% this week</th><th style="padding:8px">60% from Thursday</th><th style="padding:8px">Email</th>
</tr></thead>
<tbody>${table}</tbody>
</table>
</div></body></html>`,
    `Told ${users.length} users remaining 60% ($${total60.toFixed(2)}) starts ${THURSDAY_LABEL}.`,
  );

  writeFileSync(
    SENT_PATH,
    JSON.stringify(
      {
        sentAt: new Date().toISOString(),
        thursday: THURSDAY_LABEL,
        total60,
        users: users.map((u) => ({
          name: u.name,
          email: u.email,
          total40: u.total40,
          total60: u.total60,
          emailed: u.emailed,
          error: u.error ?? null,
        })),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        users: users.length,
        total60: total60.toFixed(2),
        failed: users.filter((u) => !u.emailed).length,
        rows: users.map((u) => ({
          name: u.name,
          email: u.email,
          total40: u.total40.toFixed(2),
          total60: u.total60.toFixed(2),
          emailed: u.emailed,
          error: u.error ?? null,
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
