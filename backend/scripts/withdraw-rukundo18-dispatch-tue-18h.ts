/**
 * Admin: wallet withdrawal for rukundo18@gmail.com (Olive) + reschedule dispatch
 * starting Tue 18:00 EAT, then email admin the full list.
 *
 * Idempotent: re-run skips withdrawal if pending payout or reference tx exists;
 * reschedule overwrites scheduledApproveAt for the same batch scope.
 *
 * Usage:
 *   cd backend && npx tsx scripts/withdraw-rukundo18-dispatch-tue-18h.ts
 *
 * Env overrides:
 *   WALLET_ADDRESS=T...          required if user has no saved TRC20 wallet
 *   WALLET_LABEL=Binance         optional label when creating saved wallet
 *   GRANT_KYC_EXEMPT=1             set instantWithdrawKycExempt when KYC missing
 *   FIRST_DELIVERY_UTC=2026-09-08T15:00:00.000Z   Tue 18:00 EAT
 *   LAST_DELIVERY_UTC=2026-09-09T06:00:00.000Z    Wed 09:00 EAT (15h window)
 *   ADMIN_EMAIL=willeratmit12@gmail.com
 *   DRY_RUN=1
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { quoteWithdrawalFees } from '../src/wallet/withdrawal-schedule';
import {
  SUNDAY_BATCH_ADJUSTMENT_PERCENT,
  applySundayBatchAdjustment,
  formatKampalaDateTime,
  sundayUtcStart,
} from '../src/payouts/sunday-withdraw-batch.util';

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
const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const USER_ID = 'cmt8bko1k0id7lo01tjxgzeke';
const EMAIL = 'rukundo18@gmail.com';
const ADMIN_ID = 'cmqmtehqi0000wfaxxntkiua9';
const WITHDRAW_REF = 'admin_withdraw_rukundo18_2026-09-08';

/** Tue 8 Sep 2026 18:00 EAT */
const FIRST_DELIVERY_UTC =
  process.env.FIRST_DELIVERY_UTC || '2026-09-08T15:00:00.000Z';
/** Wed 9 Sep 2026 09:00 EAT — same 15h window as prior Mon→Tue dispatch */
const LAST_DELIVERY_UTC =
  process.env.LAST_DELIVERY_UTC || '2026-09-09T06:00:00.000Z';

const walletAddressOverride = process.env.WALLET_ADDRESS?.trim() || '';
const walletLabelOverride = process.env.WALLET_LABEL?.trim() || 'TRC20 wallet';
const grantKycExempt = process.env.GRANT_KYC_EXEMPT === '1';

type PayoutRow = {
  id: string;
  status: string;
  traderShare: Prisma.Decimal;
  platformShare: Prisma.Decimal;
  virtualProfit: Prisma.Decimal;
  walletAddress: string | null;
  scheduledApproveAt: Date | null;
  requestedAt: Date;
  notes: string | null;
  displayName: string;
  email: string | null;
  investorVvipActive: boolean;
};

function formatKampalaWhen(date: Date) {
  return date.toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatUtcWhen(date: Date) {
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isoWeekYear(date: Date): { weekNumber: number; year: number } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { weekNumber, year: d.getUTCFullYear() };
}

function evenSlots(count: number, firstMs: number, lastMs: number): Date[] {
  if (count <= 0) return [];
  if (count === 1) return [new Date(firstMs)];
  const step = (lastMs - firstMs) / (count - 1);
  return Array.from({ length: count }, (_, i) => new Date(firstMs + step * i));
}

function stripPriorRescheduleNotes(notes: string | null) {
  return (notes ?? '')
    .replace(/\s*— Rescheduled auto-delivery[^—]*?(?= —|$)/g, '')
    .replace(/\s*— Custom dispatch window[^—]*?(?= —|$)/g, '')
    .replace(/\s*— Tue 18:00 dispatch[^—]*?(?= —|$)/g, '')
    .trim();
}

function hasBatchAdjustment(notes: string | null) {
  return /Sunday batch (9% adjustment|VVIP waiver)/.test(notes ?? '');
}

function parseOriginalNet(notes: string | null, traderShare: number) {
  const m = (notes || '').match(/Sunday batch 9% adjustment: net \$([0-9.]+)/);
  return m ? Number(m[1]) : traderShare;
}

function batchAdjustmentUpdate(p: PayoutRow): {
  traderShare: number;
  platformShare: number;
  noteSuffix: string;
} | null {
  if (hasBatchAdjustment(p.notes)) return null;

  const originalNet = Number(p.traderShare);
  const platformShare = Number(p.platformShare);

  if (p.investorVvipActive) {
    return {
      traderShare: originalNet,
      platformShare,
      noteSuffix: `Sunday batch VVIP waiver — no ${SUNDAY_BATCH_ADJUSTMENT_PERCENT}% adjustment; net $${originalNet.toFixed(2)} USDT`,
    };
  }

  const { adjustedNet, reduction } = applySundayBatchAdjustment(originalNet);
  return {
    traderShare: adjustedNet,
    platformShare: Math.round((platformShare + reduction) * 100) / 100,
    noteSuffix: `Sunday batch ${SUNDAY_BATCH_ADJUSTMENT_PERCENT}% adjustment: net $${originalNet.toFixed(2)} → $${adjustedNet.toFixed(2)} USDT`,
  };
}

async function fetchPendingBatch(dayStart: Date): Promise<PayoutRow[]> {
  return prisma.$queryRaw<PayoutRow[]>`
    SELECT
      p.id,
      p.status,
      p."traderShare",
      p."platformShare",
      p."virtualProfit",
      p."walletAddress",
      p."scheduledApproveAt",
      p."requestedAt",
      p.notes,
      u."displayName",
      u.email,
      u."investorVvipActive"
    FROM payouts p
    JOIN users u ON u.id = p."userId"
    WHERE p.status = 'PENDING'
      AND p.source = 'DEPOSITOR'
      AND p."walletAddress" IS NOT NULL
      AND (p."payoutMethod" IS NULL OR p."payoutMethod" != 'MOBILE_MONEY')
      AND p."scheduledApproveAt" IS NOT NULL
      AND p."scheduledApproveAt" >= ${dayStart}
    ORDER BY p."scheduledApproveAt" ASC
  `;
}

async function resolveSavedWallet(): Promise<{
  id: string;
  address: string;
  label: string;
  network: string;
  created?: boolean;
} | null> {
  const existing = await prisma.savedWithdrawalWallet.findFirst({
    where: { userId: USER_ID, network: 'TRC20' },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) {
    return {
      id: existing.id,
      address: existing.address,
      label: existing.label,
      network: existing.network,
    };
  }
  if (!walletAddressOverride) return null;
  if (dryRun) {
    return {
      id: 'dry-run-wallet',
      address: walletAddressOverride,
      label: walletLabelOverride,
      network: 'TRC20',
      created: true,
    };
  }
  const created = await prisma.savedWithdrawalWallet.create({
    data: {
      userId: USER_ID,
      label: walletLabelOverride,
      address: walletAddressOverride,
      network: 'TRC20',
    },
  });
  return {
    id: created.id,
    address: created.address,
    label: created.label,
    network: created.network,
    created: true,
  };
}

async function createWithdrawal(): Promise<{
  ok: boolean;
  blockers: string[];
  payoutId?: string;
  gross?: number;
  net?: number;
  fee?: number;
  wallet?: string;
}> {
  const blockers: string[] = [];

  const [user, wallet, kyc, existingPending, existingRef] = await Promise.all([
    prisma.user.findUnique({
      where: { id: USER_ID },
      select: {
        email: true,
        displayName: true,
        status: true,
        investorVipActive: true,
        investorVvipActive: true,
        instantWithdraw: true,
        instantWithdrawKycExempt: true,
      },
    }),
    prisma.platformWallet.findUnique({ where: { userId: USER_ID } }),
    prisma.kycVerification.findUnique({
      where: { userId: USER_ID },
      select: { status: true },
    }),
    prisma.payout.findFirst({
      where: { userId: USER_ID, source: 'DEPOSITOR', status: 'PENDING' },
    }),
    prisma.walletTransaction.findFirst({
      where: { userId: USER_ID, referenceId: WITHDRAW_REF },
    }),
  ]);

  if (!user) throw new Error('User not found');
  if (user.email?.toLowerCase() !== EMAIL) {
    throw new Error(`Email mismatch: ${user.email}`);
  }
  if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
    blockers.push(`Account status ${user.status}`);
  }
  if (existingPending) {
    return {
      ok: true,
      blockers: [],
      payoutId: existingPending.id,
      gross: Number(existingPending.virtualProfit),
      net: Number(existingPending.traderShare),
      fee: Number(existingPending.platformShare),
      wallet: existingPending.walletAddress ?? undefined,
    };
  }
  if (existingRef) {
    const linked = await prisma.payout.findFirst({
      where: {
        userId: USER_ID,
        notes: { contains: WITHDRAW_REF },
      },
      orderBy: { requestedAt: 'desc' },
    });
    if (linked) {
      return {
        ok: true,
        blockers: [],
        payoutId: linked.id,
        gross: Number(linked.virtualProfit),
        net: Number(linked.traderShare),
        fee: Number(linked.platformShare),
        wallet: linked.walletAddress ?? undefined,
      };
    }
  }

  const kycOk =
    kyc?.status === 'APPROVED' ||
    (user.instantWithdraw && user.instantWithdrawKycExempt);
  if (!kycOk) {
    if (grantKycExempt && user.instantWithdraw && !dryRun) {
      await prisma.user.update({
        where: { id: USER_ID },
        data: { instantWithdrawKycExempt: true },
      });
    } else if (!grantKycExempt) {
      blockers.push(
        `KYC not approved (${kyc?.status ?? 'NONE'}) — set GRANT_KYC_EXEMPT=1 to grant admin KYC exempt`,
      );
    }
  }

  const savedWallet = await resolveSavedWallet();
  if (!savedWallet) {
    blockers.push(
      'No saved TRC20 wallet — set WALLET_ADDRESS=... (and optional WALLET_LABEL=...)',
    );
  }

  if (!wallet) blockers.push('Platform wallet not found');
  const grossAmount = Math.round(Number(wallet?.availableBalance ?? 0) * 100) / 100;
  if (grossAmount <= 0) blockers.push('No available wallet balance');

  if (blockers.length > 0 || !savedWallet) {
    return { ok: false, blockers };
  }

  const config = await prisma.platformConfig.findUnique({
    where: { id: 'default' },
  });
  const quote = quoteWithdrawalFees({
    grossUsdt: grossAmount,
    processingFeeUsdt: user.investorVipActive
      ? 0
      : Number(config?.walletWithdrawalFeeUsdt ?? 3),
    scheduleEnabled: config?.withdrawalScheduleEnabled !== false,
    preferredSchedule:
      String(config?.withdrawalPreferredSchedule || 'WEEKLY').toUpperCase() ===
      'MONTHLY'
        ? 'MONTHLY'
        : 'WEEKLY',
    offSchedulePenaltyPercent: Number(
      config?.withdrawalOffSchedulePenaltyPercent ?? 8,
    ),
  });

  const fee = quote.totalFeesUsdt;
  const netPayout = quote.netPayoutUsdt;
  const processingFeeOnly = quote.processingFeeUsdt;
  const penaltyUsdt = quote.penaltyUsdt;
  const investorBalance = Number(wallet!.investorBalance);

  if (fee > 0 && grossAmount <= fee) {
    blockers.push(`Gross $${grossAmount} does not exceed fees $${fee}`);
    return { ok: false, blockers };
  }
  if (netPayout <= 0) {
    blockers.push('Net payout would be zero after fees');
    return { ok: false, blockers };
  }

  if (dryRun) {
    return {
      ok: true,
      blockers: [],
      gross: grossAmount,
      net: netPayout,
      fee,
      wallet: savedWallet.address,
    };
  }

  const { weekNumber, year } = isoWeekYear(new Date());
  const feeLabel =
    penaltyUsdt > 0
      ? `$${processingFeeOnly.toFixed(2)} fee + $${penaltyUsdt.toFixed(2)} platform fee (${quote.penaltyPercent}%)`
      : processingFeeOnly > 0
        ? `$${processingFeeOnly.toFixed(2)} fee`
        : 'VIP $0 fee';

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.platformWallet.findUnique({
      where: { userId: USER_ID },
    });
    const available = Number(current?.availableBalance ?? 0);
    if (available < grossAmount) {
      throw new Error(
        `Insufficient balance: have $${available}, need $${grossAmount}`,
      );
    }
    const balanceAfter = Math.round((available - grossAmount) * 100) / 100;

    await tx.platformWallet.update({
      where: { userId: USER_ID },
      data: { availableBalance: balanceAfter },
    });

    const payout = await tx.payout.create({
      data: {
        userId: USER_ID,
        source: 'DEPOSITOR',
        virtualProfit: grossAmount,
        traderShare: netPayout,
        platformShare: fee,
        traderPercent:
          grossAmount > 0
            ? Math.round((netPayout / grossAmount) * 10000) / 100
            : 100,
        weekNumber,
        year,
        status: 'PENDING',
        walletAddress: savedWallet.address,
        payoutMethod: 'TRC20',
        notes: [
          'Platform wallet',
          `withdrawal — $${grossAmount.toFixed(2)} USDT gross`,
          `$${processingFeeOnly.toFixed(2)} processing fee`,
          penaltyUsdt > 0
            ? `$${penaltyUsdt.toFixed(2)} platform fee (${quote.penaltyPercent}%)`
            : 'on-schedule',
          `$${netPayout.toFixed(2)} USDT payout → ${savedWallet.label} (${savedWallet.network})`,
          `who: ${user.displayName} <${user.email}>`,
          `admin script ${WITHDRAW_REF} (${ADMIN_ID})`,
        ].join(', '),
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId: USER_ID,
        amount: -grossAmount,
        type: 'DEPOSITOR_WITHDRAW',
        description: `Wallet withdrawal — $${grossAmount.toFixed(2)} USDT (${feeLabel}, $${netPayout.toFixed(2)} payout) → ${savedWallet.label}`,
        referenceId: WITHDRAW_REF,
        balanceAfter,
      },
    });

    return { payout, balanceAfter };
  });

  await prisma.auditLog.create({
    data: {
      adminId: ADMIN_ID,
      action: 'ADMIN_ADJUSTMENT',
      targetId: USER_ID,
      metadata: {
        source: 'withdraw-rukundo18-dispatch-tue-18h',
        payoutId: result.payout.id,
        grossAmount,
        netPayout,
        fee,
        destination: savedWallet.address,
        investorBalanceUntouched: investorBalance,
        savedWalletCreated: Boolean(savedWallet.created),
      },
    },
  });

  return {
    ok: true,
    blockers: [],
    payoutId: result.payout.id,
    gross: grossAmount,
    net: netPayout,
    fee,
    wallet: savedWallet.address,
  };
}

async function main() {
  const now = new Date();
  const dayStart = sundayUtcStart(now);
  const firstDelivery = new Date(FIRST_DELIVERY_UTC);
  const lastDelivery = new Date(LAST_DELIVERY_UTC);

  if (Number.isNaN(firstDelivery.getTime()) || Number.isNaN(lastDelivery.getTime())) {
    throw new Error('Invalid FIRST_DELIVERY_UTC or LAST_DELIVERY_UTC');
  }
  if (lastDelivery.getTime() < firstDelivery.getTime()) {
    throw new Error('LAST_DELIVERY_UTC must be after FIRST_DELIVERY_UTC');
  }

  const withdrawal = await createWithdrawal();

  let batch = await fetchPendingBatch(dayStart);

  if (withdrawal.ok && withdrawal.payoutId) {
    const alreadyIn = batch.some((p) => p.id === withdrawal.payoutId);
    if (!alreadyIn) {
      const fresh = await prisma.$queryRaw<PayoutRow[]>`
        SELECT
          p.id, p.status, p."traderShare", p."platformShare", p."virtualProfit",
          p."walletAddress", p."scheduledApproveAt", p."requestedAt", p.notes,
          u."displayName", u.email, u."investorVvipActive"
        FROM payouts p
        JOIN users u ON u.id = p."userId"
        WHERE p.id = ${withdrawal.payoutId}
      `;
      if (fresh[0]) batch = [...batch, fresh[0]];
    }
  }

  if (batch.length === 0) {
    throw new Error('No PENDING batch payouts to schedule');
  }

  const dynamicLast =
    batch.length === 1
      ? firstDelivery
      : new Date(
          firstDelivery.getTime() +
            ((lastDelivery.getTime() - firstDelivery.getTime()) /
              Math.max(batch.length - 1, 1)) *
              (batch.length - 1),
        );

  const slots = evenSlots(
    batch.length,
    firstDelivery.getTime(),
    dynamicLast.getTime(),
  );
  const intervalMinutes =
    batch.length > 1
      ? (dynamicLast.getTime() - firstDelivery.getTime()) /
        (batch.length - 1) /
        60000
      : 0;

  type Row = {
    pos: number;
    payoutId: string;
    name: string;
    email: string | null;
    gross: number;
    net: number;
    wallet: string;
    status: string;
    scheduled: Date;
    isNewOlive: boolean;
  };

  const rows: Row[] = [];

  for (let i = 0; i < batch.length; i++) {
    const p = batch[i];
    const scheduledAt = slots[i];
    const gross = Number(p.virtualProfit);
    let net = Number(p.traderShare);
    const adj = batchAdjustmentUpdate(p);
    if (adj) net = adj.traderShare;

    const rescheduleNote = `Tue 18:00 dispatch ${formatKampalaDateTime(scheduledAt)} Kampala (even spread Tue 18:00 → Wed 09:00 EAT)`;
    const baseNotes = stripPriorRescheduleNotes(p.notes);
    const notes = [baseNotes, adj?.noteSuffix, rescheduleNote]
      .filter(Boolean)
      .join(' — ')
      .trim();

    if (!dryRun) {
      if (adj) {
        await prisma.$executeRaw`
          UPDATE payouts
          SET "scheduledApproveAt" = ${scheduledAt},
              "traderShare" = ${adj.traderShare},
              "platformShare" = ${adj.platformShare},
              notes = ${notes}
          WHERE id = ${p.id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE payouts
          SET "scheduledApproveAt" = ${scheduledAt},
              notes = ${notes}
          WHERE id = ${p.id}
        `;
      }
    }

    rows.push({
      pos: i + 1,
      payoutId: p.id,
      name: p.displayName,
      email: p.email,
      gross,
      net,
      wallet: p.walletAddress!,
      status: p.status,
      scheduled: scheduledAt,
      isNewOlive: p.id === withdrawal.payoutId,
    });
  }

  if (!dryRun) {
    await prisma.$executeRaw`
      UPDATE platform_config
      SET "sundayWithdrawBatchAnchor" = ${firstDelivery},
          "sundayWithdrawBatchFinalizedAt" = NULL,
          "sundayWithdrawBatchScheduleNotifiedAt" = ${now}
      WHERE id = 'default'
    `;
  }

  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const lastSlot = rows[rows.length - 1].scheduled;

  const tableRows = rows
    .map(
      (r) =>
        `<tr${r.isNewOlive ? ' style="background:#1e3a5f"' : ''}>
          <td style="padding:8px;border-bottom:1px solid #334155;">#${r.pos}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.name)}${r.isNewOlive ? ' <span style="color:#60a5fa">(new)</span>' : ''}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtml(r.email ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.net.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>${escapeHtml(formatKampalaWhen(r.scheduled))} EAT</strong><br><span style="color:#94a3b8;font-size:11px;">${escapeHtml(formatUtcWhen(r.scheduled))}</span></td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${r.status}</td>
        </tr>`,
    )
    .join('');

  const textLines = rows
    .map(
      (r) =>
        `#${r.pos} ${r.name} (${r.email ?? '—'}) net $${r.net.toFixed(2)} @ ${formatKampalaWhen(r.scheduled)} EAT [${r.status}]${r.isNewOlive ? ' NEW' : ''}`,
    )
    .join('\n');

  const blockerNote =
    !withdrawal.ok && withdrawal.blockers.length > 0
      ? `<div style="background:#451a1a;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #ef4444">
<p style="margin:0;color:#fca5a5;font-weight:600">Withdrawal blocked — ${escapeHtml(EMAIL)}</p>
<ul style="margin:8px 0 0;color:#fecaca;font-size:13px">${withdrawal.blockers.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
</div>`
      : withdrawal.ok && withdrawal.payoutId
        ? `<p style="color:#86efac;font-size:13px;">New withdrawal for <strong>${escapeHtml(EMAIL)}</strong>: gross $${withdrawal.gross?.toFixed(2)} → net <strong>$${withdrawal.net?.toFixed(2)} USDT</strong> (payout ${withdrawal.payoutId}).</p>`
        : '';

  let emailSent = false;
  const subject = `[Dispatch] ${rows.length} withdrawals — $${totalNet.toFixed(2)} USDT · Tue 18:00 EAT start`;

  if (!dryRun) {
    if (!resendKey) throw new Error('RESEND_API_KEY not set');

    const html = `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px">
<div style="max-width:900px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px">
<h1 style="color:#fff;font-size:20px">Withdrawal dispatch — Tue 18:00 EAT</h1>
<p>Batch: <strong>${rows.length} payouts</strong> · net total <strong>$${totalNet.toFixed(2)} USDT</strong></p>
${blockerNote}
<p><strong>First delivery:</strong> ${formatKampalaWhen(firstDelivery)} EAT<br>
<strong>Last delivery:</strong> ${formatKampalaWhen(lastSlot)} EAT<br>
<strong>Interval:</strong> ~${intervalMinutes.toFixed(1)} minutes between payouts.</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
<thead><tr style="color:#94a3b8;text-align:left">
<th style="padding:8px">#</th><th style="padding:8px">User</th><th style="padding:8px">Email</th>
<th style="padding:8px">Net USDT</th><th style="padding:8px">Scheduled (EAT)</th><th style="padding:8px">Status</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
<p style="color:#94a3b8;font-size:12px;margin-top:16px">Prepared ${formatKampalaWhen(now)} EAT</p>
</div></body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [adminEmail],
        subject,
        html,
        text: `Dispatch (${rows.length} payouts, $${totalNet.toFixed(2)} net USDT)\nFirst: ${formatKampalaWhen(firstDelivery)} EAT\nLast: ${formatKampalaWhen(lastSlot)} EAT\n\n${withdrawal.blockers.length ? `BLOCKED ${EMAIL}: ${withdrawal.blockers.join('; ')}\n\n` : ''}${textLines}`,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);
    emailSent = true;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        withdrawal: {
          created: withdrawal.ok && Boolean(withdrawal.payoutId),
          payoutId: withdrawal.payoutId ?? null,
          gross: withdrawal.gross?.toFixed(2) ?? null,
          net: withdrawal.net?.toFixed(2) ?? null,
          fee: withdrawal.fee?.toFixed(2) ?? null,
          wallet: withdrawal.wallet ?? null,
          blockers: withdrawal.blockers,
        },
        dispatch: {
          count: rows.length,
          totalNetUsdt: totalNet.toFixed(2),
          firstDeliveryEat: formatKampalaWhen(firstDelivery),
          lastDeliveryEat: formatKampalaWhen(lastSlot),
          intervalMinutes: intervalMinutes.toFixed(1),
          schedule: rows.map((r) => ({
            pos: r.pos,
            name: r.name,
            email: r.email,
            net: r.net.toFixed(2),
            scheduledEat: formatKampalaWhen(r.scheduled),
            scheduledUtc: formatUtcWhen(r.scheduled),
            status: r.status,
            isNewOlive: r.isNewOlive,
          })),
        },
        adminEmail,
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
