"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type InvestorOptOutStatus } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";

/** Shown immediately so redeem procedure is visible even if the API is slow or fails. */
export const REDEEM_POLICY_FALLBACK = {
  title: "Redeem Smart Invest",
  businessDays: 5,
  day3Report: 3,
  bullets: [
    "Redeeming Smart Invest takes 5 consecutive business days (Monday–Friday). Weekends do not count.",
    "Your invested capital is returned to your wallet on business day 5. Capital is protected.",
    "Full profits are not guaranteed. Yield already credited to your wallet stays there. Future daily yield and any unsettled Smart Invest trading P&L are not paid during the cooling period.",
    "On business day 3 you receive a written report: capital to refund, profits already received, and profits you will not receive.",
    "You cannot move funds between wallet and Smart Invest while a redeem is in progress.",
  ],
};

const REDEEM_REASONS_FALLBACK = [
  { code: "LIQUIDITY", label: "I need the capital for personal use" },
  { code: "TIMING", label: "Unhappy with current withdrawal timing" },
  { code: "RETURNS", label: "Returns have not met my expectations" },
  { code: "MAINTENANCE", label: "I prefer to pause during system maintenance" },
  { code: "OTHER", label: "Other" },
];

const TIMELINE = [
  {
    day: "Day 1",
    title: "Request redeem",
    detail:
      "Verify by email, choose a reason, and confirm. Daily yield and wallet ↔ invest transfers pause immediately.",
  },
  {
    day: "Day 3",
    title: "Written report",
    detail:
      "You get an email and in-app report: capital to refund, profits you keep, and profits not paid going forward.",
  },
  {
    day: "Day 5",
    title: "Capital returned",
    detail:
      "Invested capital is settled back to your wallet (INVESTOR_REDEEM). Smart Invest closes.",
  },
] as const;

const APPLY_STEPS = [
  { n: 1 as const, label: "Send code" },
  { n: 2 as const, label: "Enter code" },
  { n: 3 as const, label: "Submit" },
];

function reasonLabelFor(
  data: InvestorOptOutStatus | null,
  code: string,
  note: string,
) {
  const fromRequest = data?.request?.reasonLabel;
  if (fromRequest && data?.request?.reasonCode === code) return fromRequest;
  const reasons = data?.reasons?.length ? data.reasons : REDEEM_REASONS_FALLBACK;
  const label = reasons.find((r) => r.code === code)?.label ?? code;
  const extra = note.trim();
  if (!extra) return label;
  return code === "OTHER" ? `${label}: ${extra}` : `${label} — ${extra}`;
}

function ApplyStepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2">
      {APPLY_STEPS.map((item, i) => {
        const done = step > item.n;
        const active = step === item.n;
        return (
          <li key={item.n} className="flex min-w-0 flex-1 items-center gap-2">
            <motion.span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done && "bg-white text-[#5C0A1A]",
                active &&
                  "bg-[#800020] text-white shadow-[0_0_14px_rgba(128,0,32,0.45)]",
                !done &&
                  !active &&
                  "border border-white/20 bg-black/30 text-gray-400",
              )}
              animate={active ? { scale: [1, 1.05, 1] } : { scale: 1 }}
              transition={
                active
                  ? { repeat: Infinity, duration: 1.8, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
            >
              {done ? "✓" : item.n}
            </motion.span>
            <span
              className={cn(
                "truncate text-xs font-medium",
                active ? "text-white" : done ? "text-[#E8D4D6]/85" : "text-gray-500",
              )}
            >
              {item.label}
            </span>
            {i < APPLY_STEPS.length - 1 && (
              <span
                className={cn(
                  "hidden h-px min-w-4 flex-1 sm:block",
                  done ? "bg-[#800020]/45" : "bg-white/10",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SignedForCard({
  request,
  highlight,
}: {
  request: NonNullable<InvestorOptOutStatus["request"]>;
  highlight?: boolean;
}) {
  const reason =
    request.reasonLabel ||
    [request.reasonCode, request.reasonNote].filter(Boolean).join(" — ");
  return (
    <div
      className={
        highlight
          ? "rounded-2xl border border-white/70 bg-[#800020]/18 p-5 shadow-[0_0_28px_rgba(128,0,32,0.22)]"
          : "rounded-2xl border border-white/15 bg-white/[0.04] p-5"
      }
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E8D4D6]/90">
        Acknowledgment
      </p>
      <h3 className="mt-1 text-base font-semibold text-white">
        {highlight ? "What you just signed for 🙁" : "What you signed for"}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-white/80">
        {highlight
          ? "A copy of this acknowledgment was emailed to you. Trade Guard ops received the same record."
          : "This is the redeem you confirmed. Capital is protected; full profits are not guaranteed."}
      </p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-white/50">Reason</dt>
          <dd className="text-right text-white">{reason}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50">Requested</dt>
          <dd className="text-right text-white">
            {request.requestedAtLabel ?? "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50">Day 1 — freeze</dt>
          <dd className="text-right text-[#E8D4D6]">
            Yield and transfers paused now
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50">Day 3 — report</dt>
          <dd className="text-right text-white">{request.day3AtLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50">Day 5 — capital to wallet</dt>
          <dd className="text-right text-white">{request.settleAtLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50">Capital protected</dt>
          <dd className="text-right font-semibold text-white">
            {formatCurrency(request.capitalUsdt)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50">Profits you keep (already in wallet)</dt>
          <dd className="text-right text-emerald-300">
            {formatCurrency(
              request.report?.profitsKeptUsdt ?? request.profitToDateUsdt,
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-white/55">
        Full profits are not guaranteed. Future daily yield and unsettled
        Smart Invest trading P&amp;L are not paid during the cooling period.
      </p>
    </div>
  );
}

export function InvestorOptOutPanel({
  enrolled,
  onChanged,
}: {
  enrolled: boolean;
  onChanged: () => void;
}) {
  const [data, setData] = useState<InvestorOptOutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [reasonCode, setReasonCode] = useState("LIQUIDITY");
  const [reasonNote, setReasonNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.investor.optOutStatus();
      setData(s);
      setError("");
      if (s.verify?.cooldownSec) setCooldownSec(s.verify.cooldownSec);
      if (s.verify?.pending) setCodeSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load redeem status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setTimeout(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldownSec]);

  const cooling = data?.request?.status === "COOLING";
  const settled = data?.request?.status === "SETTLED";
  const policy = data?.policy ?? REDEEM_POLICY_FALLBACK;
  const reasons = data?.reasons?.length ? data.reasons : REDEEM_REASONS_FALLBACK;
  const isEnrolled = data?.investorActive ?? enrolled;
  const canRequest = isEnrolled && (data ? data.eligible : true) && !cooling;
  const emailMasked = data?.verify?.emailMasked;
  const codeReady = /^\d{6}$/.test(verificationCode.trim());
  const applyStep: 1 | 2 | 3 = !codeSent ? 1 : !codeReady ? 2 : 3;

  async function sendCode() {
    setError("");
    setSendingCode(true);
    try {
      const res = await api.investor.sendOptOutVerifyEmail();
      setCodeSent(true);
      setCooldownSec(res.cooldownSec || 60);
      setData((prev) =>
        prev
          ? {
              ...prev,
              verify: {
                emailMasked: res.emailMasked ?? prev.verify?.emailMasked ?? null,
                cooldownSec: res.cooldownSec,
                pending: true,
              },
            }
          : prev,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not send verification code",
      );
    } finally {
      setSendingCode(false);
    }
  }

  async function submit() {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const s = await api.investor.requestOptOut({
        reasonCode,
        reasonNote: reasonCode === "OTHER" ? reasonNote : reasonNote || undefined,
        acknowledged: true,
        verificationCode: verificationCode.trim(),
      });
      setData(s);
      setJustSubmitted(true);
      setVerificationCode("");
      setCodeSent(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start redeem");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {data?.maintenance.active && (
        <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm text-amber-50">
          <p className="font-semibold text-amber-100">Planned system maintenance</p>
          <p className="mt-1.5 leading-relaxed text-amber-100/90">
            Requested withdrawals pay <strong>40%</strong> by{" "}
            {data.maintenance.withdraw40By}. Members who stay in Smart Invest
            then receive <strong>{data.maintenance.weeklyProfitPercent}% of
            total profits per week</strong> until the platform is fully restored
            (up to 14 days). Daily yield is paused during this window.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-[#5C0A1A]/80 via-[#800020]/20 to-white/[0.04] p-5 shadow-[0_0_40px_rgba(128,0,32,0.14)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E8D4D6]/90">
          Closing Smart Invest
        </p>
        <h3 className="mt-1 text-lg font-semibold text-white">
          We&apos;re sorry to see you go 😢
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-white/75">
          Leaving is a serious step 🙁 — we know that can feel hard 💔. Redeeming
          Smart Invest is a{" "}
          <strong className="text-white">5 business-day (Mon–Fri)</strong> process.
          Capital in Smart Invest is protected and returns to your wallet on day
          5. <strong className="text-white">Full profits are not guaranteed</strong>{" "}
          — yield already in your wallet stays; future daily yield and unsettled
          trading P&amp;L are not paid.
        </p>

        <ol className="mt-4 grid gap-2 sm:grid-cols-3">
          {TIMELINE.map((step, i) => {
            const dateLabel =
              cooling && data?.request
                ? i === 1
                  ? data.request.day3AtLabel
                  : i === 2
                    ? data.request.settleAtLabel
                    : "In progress"
                : null;
            return (
              <li
                key={step.day}
                className="rounded-xl border border-white/15 bg-black/25 px-3 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#E8D4D6]/80">
                  {step.day}
                </p>
                <p className="mt-1 text-sm font-medium text-white">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/55">
                  {step.detail}
                </p>
                {dateLabel && (
                  <p className="mt-2 text-xs font-medium text-[#E8D4D6]">
                    {dateLabel}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-white/75">
          {(policy.bullets ?? REDEEM_POLICY_FALLBACK.bullets).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>

      <AnimatePresence mode="wait">
        {justSubmitted && data?.request && (
          <motion.div
            key="signed-new"
            initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <SignedForCard request={data.request} highlight />
          </motion.div>
        )}
      </AnimatePresence>

      {cooling && data?.request && !justSubmitted && (
        <SignedForCard request={data.request} />
      )}

      {cooling && data?.request && (
        <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-5">
          <h3 className="text-base font-semibold text-white">
            Redeem in progress
          </h3>
          <p className="mt-1 text-sm text-white/60">
            Transfers and daily yield are paused. Capital is protected.
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-white/45">Capital to refund</dt>
              <dd className="font-semibold text-white">
                {formatCurrency(data.request.capitalUsdt)}
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Profits you keep</dt>
              <dd className="font-semibold text-emerald-300">
                {formatCurrency(
                  data.request.report?.profitsKeptUsdt ??
                    data.request.profitToDateUsdt,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Profits not paid going forward</dt>
              <dd className="font-semibold text-amber-200">Daily yield stopped</dd>
            </div>
          </dl>
        </div>
      )}

      {settled && data?.request && !cooling && (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5 text-sm text-emerald-50">
          <p className="font-semibold">Smart Invest closed</p>
          <p className="mt-1 text-emerald-100/90">
            Capital of {formatCurrency(data.request.capitalUsdt)} was scheduled
            back to your wallet. You can use Wallet as usual.
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {canRequest && !justSubmitted && (
          <motion.div
            key="apply-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl border border-white/20 bg-white/[0.04] p-5"
          >
            <h3 className="text-base font-semibold text-white">
              Request redeem 😢
            </h3>
            <p className="mt-1 text-sm text-white/60">
              We will email a verification code first. After you submit, you
              receive a signed-for copy of this request.
            </p>

            <div className="mt-4">
              <ApplyStepper step={applyStep} />
            </div>

            <label className="mt-5 block text-xs text-white/55">Reason</label>
            <select
              className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            <label className="mt-4 block text-xs text-white/55">
              {reasonCode === "OTHER" ? "Please tell us briefly why" : "Note (optional)"}
            </label>
            <textarea
              className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
              rows={3}
              placeholder={
                reasonCode === "OTHER"
                  ? "Required for Other"
                  : "Add a note if you want"
              }
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
            />

            <div className="mt-4 rounded-xl border border-white/15 bg-black/25 p-3">
              <p className="text-xs font-medium text-[#E8D4D6]">
                Email verification required
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                We send a 6-digit code to{" "}
                <strong className="text-white/85">
                  {emailMasked ?? "your account email"}
                </strong>
                . It expires in 10 minutes. This is not a scary admin notice —
                only you can finish the redeem.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={sendingCode || cooldownSec > 0}
                  className={cn(
                    sendingCode &&
                      "disabled:opacity-100 shadow-[0_0_16px_rgba(128,0,32,0.4)]",
                  )}
                  onClick={() => void sendCode()}
                >
                  {sendingCode && (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  )}
                  {codeSent
                    ? cooldownSec > 0
                      ? `Resend code (${cooldownSec}s)`
                      : "Resend verification code"
                    : "Send verification code"}
                </Button>
                {codeSent && (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-xs text-emerald-300"
                  >
                    Code sent. Check your inbox.
                  </motion.span>
                )}
              </div>
              <AnimatePresence initial={false}>
                {codeSent && (
                  <motion.div
                    key="code-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <label className="mt-3 block text-xs text-white/55">
                      6-digit code
                    </label>
                    <input
                      className="mt-1 w-full max-w-[12rem] rounded-md border border-white/15 bg-black/40 px-3 py-2 text-center text-lg tracking-[0.35em] text-white"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) =>
                        setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <label className="mt-3 flex items-start gap-2 text-sm text-white/75">
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                I understand capital returns in 5 business days and that full
                profits are not guaranteed. I am signing for:{" "}
                <strong className="text-white">
                  {reasonLabelFor(data, reasonCode, reasonNote)}
                </strong>
                .
              </span>
            </label>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <motion.div
              className="mt-4 inline-flex rounded-lg"
              animate={
                submitting
                  ? {
                      boxShadow: [
                        "0 0 8px rgba(128,0,32,0.3)",
                        "0 0 24px rgba(128,0,32,0.6)",
                        "0 0 8px rgba(128,0,32,0.3)",
                      ],
                    }
                  : { boxShadow: "0 0 0 rgba(128,0,32,0)" }
              }
              transition={
                submitting
                  ? { repeat: Infinity, duration: 1.15, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
            >
              <Button
                className={cn(
                  "redeem-btn hover:bg-[#7A1F2B]",
                  submitting && "disabled:opacity-100",
                )}
                disabled={
                  submitting ||
                  !acknowledged ||
                  !codeReady ||
                  (reasonCode === "OTHER" && !reasonNote.trim())
                }
                onClick={() => void submit()}
              >
                {submitting && (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                )}
                {submitting ? "Submitting redeem…" : "Confirm redeem Smart Invest"}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isEnrolled && !cooling && (
        <p className="text-sm text-white/60">
          You must be enrolled in Smart Invest to request redeem. The 5-day
          procedure above is the full exit.{" "}
          <Link
            href="/invest"
            className="text-white underline underline-offset-2"
          >
            Open Smart Invest
          </Link>{" "}
          to enroll, then return here.
        </p>
      )}

      {isEnrolled && loading && !data && (
        <p className="text-xs text-white/40">Checking whether a redeem is already open…</p>
      )}

      {error && !canRequest && (
        <p className="text-sm text-danger">{error}</p>
      )}
    </div>
  );
}
