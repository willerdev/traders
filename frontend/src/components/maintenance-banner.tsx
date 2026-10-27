"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ShieldCheck, Wrench } from "lucide-react";

export type MaintenanceInfo = {
  maxFraction?: number;
  feesWaived?: boolean;
  cancelDisabled?: boolean;
  message: string;
} | null;

export type WithdrawDaysInfo = {
  label: string;
  openToday: boolean;
  nextOpenAt: string;
  message: string;
} | null;

function useCountdown(target?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (!Number.isFinite(diff)) return null;
  if (diff <= 0) return "opening soon";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

/** Shared "new look" maintenance status card used on Wallet / Payouts / Invest. */
export function MaintenanceBanner({
  maintenance,
  withdrawDays,
  compact = false,
}: {
  maintenance?: MaintenanceInfo;
  withdrawDays?: WithdrawDaysInfo;
  compact?: boolean;
}) {
  const countdown = useCountdown(
    withdrawDays && !withdrawDays.openToday ? withdrawDays.nextOpenAt : null,
  );
  if (!maintenance && !withdrawDays) return null;

  const pct =
    maintenance?.maxFraction != null
      ? Math.round(maintenance.maxFraction * 100)
      : null;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/15 via-[#0b1b3a] to-emerald-500/10 p-5 shadow-lg shadow-cyan-950/30">
      <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative flex gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/15 ring-1 ring-cyan-300/30">
          <Wrench className="h-5 w-5 text-cyan-200" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold tracking-wide text-white">
              Maintenance mode
            </h2>
            <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-cyan-200 ring-1 ring-cyan-300/25">
              Temporary
            </span>
            {pct != null && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/85">
                {pct}% withdraw limit
              </span>
            )}
            {maintenance?.feesWaived && (
              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-200 ring-1 ring-emerald-300/25">
                Fees waived
              </span>
            )}
          </div>

          {!compact && maintenance?.message && (
            <p className="mt-1.5 text-sm leading-relaxed text-cyan-50/80">
              {maintenance.message}
            </p>
          )}

          {withdrawDays && !withdrawDays.openToday && withdrawDays.message && (
            <p className="mt-1.5 text-sm leading-relaxed text-cyan-50/80">
              {withdrawDays.message}
            </p>
          )}

          {withdrawDays && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-cyan-50/75">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-cyan-200" />
                {withdrawDays.openToday ? (
                  <>
                    Withdrawals <strong className="text-emerald-300">open today</strong>
                    {" "}({withdrawDays.label})
                  </>
                ) : (
                  <>
                    Next window:{" "}
                    <strong className="text-white">
                      {new Date(withdrawDays.nextOpenAt).toLocaleDateString(
                        undefined,
                        {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        },
                      )}
                    </strong>
                    {countdown ? (
                      <span className="rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-cyan-100">
                        in {countdown}
                      </span>
                    ) : null}
                  </>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                Every withdrawal is manually reviewed
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Horizontal stepper for payout / withdrawal progress. */
export function PayoutProgressSteps({ stage }: { stage: 0 | 1 | 2 | 3 }) {
  const steps = ["Submitted", "In review", "Approved", "Paid"];
  return (
    <ol className="mt-3 flex items-center gap-1" aria-label="Withdrawal progress">
      {steps.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-1 last:flex-none">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
              i <= stage
                ? "bg-cyan-400 text-[#06202b]"
                : "bg-white/10 text-gray-500 ring-1 ring-white/10"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={`hidden text-[10px] font-medium sm:block ${
              i <= stage ? "text-cyan-100" : "text-gray-500"
            }`}
          >
            {label}
          </span>
          {i < steps.length - 1 && (
            <span
              className={`h-px flex-1 ${i < stage ? "bg-cyan-400/70" : "bg-white/10"}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
