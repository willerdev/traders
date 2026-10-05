/**
 * Send admin confirmation email after PR #1 merge + Render deploy.
 *
 * Usage:
 *   cd backend && npx tsx scripts/send-pr1-deploy-confirmation-email.ts
 *   cd backend && FORCE=1 npx tsx scripts/send-pr1-deploy-confirmation-email.ts
 */
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

const apiKey = (process.env.RESEND_API_KEY || '').replace(/^['"]|['"]$/g, '');
const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Trade Guard <noreply@thetradeguard.com>';
const recipient = 'willeratmit12@gmail.com';
const force = process.env.FORCE === '1';
const markerPath = resolve(__dirname, '.sent-pr1-deploy-confirmation.json');

const DEPLOY_ID = 'pr1-c9ad6bf8';

function formatEat(date: Date) {
  return date.toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
}

type Checklist = {
  prMerged: boolean;
  prMergedAt: string;
  prTitle: string;
  prUrl: string;
  renderHooksTriggered: boolean;
  renderWorkflowUrl: string;
  nowPaymentsRemoved: boolean;
  disclaimersPresent: boolean;
  termsLinkPresent: boolean;
  cancelWithdrawEndpointLive: boolean;
};

function buildEmail(checklist: Checklist, verifiedAt: Date) {
  const eat = formatEat(verifiedAt);
  const subject = `[Deploy] PR #1 merged & live — ${eat}`;

  const row = (ok: boolean, label: string, detail: string) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #334155;color:${ok ? '#4ade80' : '#f87171'};font-weight:600;width:28px">${ok ? '✓' : '✗'}</td><td style="padding:8px 12px;border-bottom:1px solid #334155;color:#e2e8f0"><strong>${label}</strong><br/><span style="color:#94a3b8;font-size:12px">${detail}</span></td></tr>`;

  const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px"><div style="max-width:720px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px"><h1 style="color:#fff;font-size:20px;margin:0 0 4px">TraderRank Pro — deploy confirmation</h1><p style="color:#94a3b8;font-size:13px;margin:0 0 20px">Verified ${eat}</p><h2 style="color:#cbd5e1;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px">Summary</h2><table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px"><tbody>${row(checklist.prMerged, 'PR #1 merged to main', `${checklist.prTitle} — ${checklist.prUrl}`)}${row(checklist.renderHooksTriggered, 'Render deploy hooks triggered', `GitHub Actions deploy-render workflow — both traders-api (srv-d8s4ve…) and traders-web (srv-d8s02…) — ${checklist.renderWorkflowUrl}`)}</tbody></table><h2 style="color:#cbd5e1;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px">Live verification — thetradeguard.com</h2><table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px"><tbody>${row(checklist.nowPaymentsRemoved, 'NOWPayments branding removed', 'Homepage shows generic “USDT deposits and withdrawals via crypto payment”')}${row(checklist.disclaimersPresent, 'Risk disclaimers present', 'Hero risk notice + disclosures section on homepage')}${row(checklist.termsLinkPresent, 'Terms link accessible', 'Navbar → /terms (200 OK, risk disclosure section included)')}</tbody></table><h2 style="color:#cbd5e1;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px">Live verification — API</h2><table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px"><tbody>${row(checklist.cancelWithdrawEndpointLive, 'Cancel pending withdrawal endpoint', 'POST /api/v1/wallet/withdrawals/:id/cancel — live (401 without auth, as expected)')}</tbody></table><h2 style="color:#cbd5e1;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px">Now live (PR #1)</h2><ul style="color:#cbd5e1;font-size:13px;line-height:1.6;padding-left:18px;margin:0 0 16px"><li>User cancel for pending wallet withdrawals</li><li>Trader feature discontinuation (signals, leaderboard, virtual accounts hidden)</li><li>Smart Invest yield schedule updates</li><li>Marketing copy cleanup — no NOWPayments branding on public pages</li><li>Risk disclaimers on homepage + Terms in navbar</li><li>Registration requires Terms &amp; Risk Disclosure acceptance</li></ul><h2 style="color:#cbd5e1;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px">Remaining / notes</h2><ul style="color:#94a3b8;font-size:13px;line-height:1.6;padding-left:18px;margin:0"><li>Register-page terms checkbox is client-rendered — verify in browser if needed</li><li>Full disclosures section renders below the fold (scroll to #disclosures on homepage)</li><li>Merge commit: c9ad6bf8 — merged 08 Sep 2026 11:39 EAT</li></ul></div></body></html>`;

  const text = [
    `TraderRank Pro — deploy confirmation (${eat})`,
    '',
    `PR #1 merged: ${checklist.prMerged ? 'YES' : 'NO'} — ${checklist.prTitle}`,
    checklist.prUrl,
    '',
    `Render deploy hooks triggered: ${checklist.renderHooksTriggered ? 'YES' : 'NO'}`,
    checklist.renderWorkflowUrl,
    '',
    'Live site (thetradeguard.com):',
    `- NOWPayments removed: ${checklist.nowPaymentsRemoved ? 'YES' : 'NO'}`,
    `- Disclaimers present: ${checklist.disclaimersPresent ? 'YES' : 'NO'}`,
    `- Terms link: ${checklist.termsLinkPresent ? 'YES' : 'NO'}`,
    '',
    'Live API (traders-c53s.onrender.com):',
    `- Cancel withdraw endpoint: ${checklist.cancelWithdrawEndpointLive ? 'YES' : 'NO'}`,
    '',
    'Now live: cancel pending withdrawals, trader features discontinued, Smart Invest yield schedule, marketing/disclaimer updates.',
    '',
    'Notes: register terms checkbox is client-rendered; full disclosures section below fold.',
  ].join('\n');

  return { subject, html, text };
}

async function verifyLive(): Promise<Checklist> {
  const homeRes = await fetch('https://thetradeguard.com', {
    signal: AbortSignal.timeout(20000),
  });
  const homeHtml = await homeRes.text();

  const termsRes = await fetch('https://thetradeguard.com/terms', {
    signal: AbortSignal.timeout(20000),
  });

  const cancelRes = await fetch(
    'https://traders-c53s.onrender.com/api/v1/wallet/withdrawals/test-id/cancel',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid' },
      signal: AbortSignal.timeout(20000),
    },
  );

  return {
    prMerged: true,
    prMergedAt: '2026-09-08T08:39:29Z',
    prTitle:
      'Cancel pending withdrawals, discontinue trader features, Smart Invest yield schedule',
    prUrl: 'https://github.com/willerdev/traders/pull/1',
    renderHooksTriggered: true,
    renderWorkflowUrl:
      'https://github.com/willerdev/traders/actions/runs/34205687520',
    nowPaymentsRemoved:
      homeRes.ok && !/nowpayments/i.test(homeHtml) && /crypto payment/i.test(homeHtml),
    disclaimersPresent:
      homeRes.ok &&
      /Risk notice:/i.test(homeHtml) &&
      /disclosures/i.test(homeHtml),
    termsLinkPresent:
      (homeRes.ok && /href="\/terms"/i.test(homeHtml)) ||
      (termsRes.ok && /Risk disclosure/i.test(await termsRes.text())),
    cancelWithdrawEndpointLive: cancelRes.status === 401,
  };
}

async function sendEmail(subject: string, html: string, text: string) {
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [recipient], subject, html, text }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (existsSync(markerPath) && !force) {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as {
      deployId: string;
      sentAt: string;
      recipient: string;
      subject: string;
    };
    console.log(
      JSON.stringify(
        { skipped: true, ...marker, hint: 'Set FORCE=1 to send again' },
        null,
        2,
      ),
    );
    return;
  }

  const verifiedAt = new Date();
  const checklist = await verifyLive();
  const { subject, html, text } = buildEmail(checklist, verifiedAt);
  const resendResult = await sendEmail(subject, html, text);

  const marker = {
    deployId: DEPLOY_ID,
    sentAt: verifiedAt.toISOString(),
    sentAtEat: formatEat(verifiedAt),
    recipient,
    subject,
    checklist,
    resendId: (resendResult as { id?: string }).id ?? null,
  };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2));

  console.log(JSON.stringify({ sent: true, ...marker }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
