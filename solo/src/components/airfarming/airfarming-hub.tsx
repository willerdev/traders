"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  type AirfarmingApplyPayload,
  type AirfarmingStatus,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Due now";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const PHASE_LABELS: Record<string, string> = {
  idle: "Idle — funds in cash wallet",
  waiting: "Waiting for next drop",
  preparing: "Preparing drop (funds moving to Airfarming)",
  processing: "Processing drop",
  rewarding: "Reward credited",
};

export function AirfarmingHub() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<AirfarmingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [deallocAmount, setDeallocAmount] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [location, setLocation] = useState("");
  const [plannedInvestment, setPlannedInvestment] = useState("");
  const [withdrawPreference, setWithdrawPreference] =
    useState<AirfarmingApplyPayload["withdrawPreference"]>("WEEKLY");
  const [acceptTerms, setAcceptTerms] = useState(false);

  useEffect(() => {
    if (user?.displayName && !fullName) setFullName(user.displayName);
    if (user?.email && !email) setEmail(user.email);
  }, [user, fullName, email]);

  const load = useCallback(async () => {
    setError("");
    try {
      const s = await api.airfarming.status();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Airfarming");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function submitApplication() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload: AirfarmingApplyPayload = {
        fullName: fullName.trim(),
        email: email.trim(),
        age: Number(age),
        location: location.trim(),
        plannedInvestmentUsd: Number(plannedInvestment),
        withdrawPreference,
        acceptTerms,
      };
      const res = await api.airfarming.apply(payload);
      setMessage(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Application failed");
    } finally {
      setBusy(false);
    }
  }

  async function allocate() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await api.airfarming.allocate(Number(amount));
      setStatus(next);
      setAmount("");
      setMessage("Allocation committed — funds stay in cash until the next drop window.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Allocate failed");
    } finally {
      setBusy(false);
    }
  }

  async function deallocate() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await api.airfarming.deallocate(Number(deallocAmount));
      setStatus(next);
      setDeallocAmount("");
      setMessage("Commitment reduced.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deallocate failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const allocValue = Number(amount);
  const deallocValue = Number(deallocAmount);
  const week = status?.week;
  const next = status?.nextDrop;
  const enrollment = status?.enrollment;
  const enrolled = enrollment?.canAllocate ?? false;

  if (!enrolled && enrollment) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300/80">
            Airfarming
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Enrollment required
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Airfarming is invite-only. Apply for access — once approved, you can
            commit cash and receive scheduled yield drops with a weekly floor
            guarantee.
          </p>
          {enrollment.status === "PENDING" && (
            <div className="mt-4 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <p>
                Your application is <strong>pending review</strong>.
              </p>
              {enrollment.application && (
                <ul className="list-inside list-disc space-y-1 text-amber-100/90">
                  <li>
                    Planned investment:{" "}
                    {formatCurrency(enrollment.application.plannedInvestmentUsd)}
                  </li>
                  <li>
                    Withdraw preference:{" "}
                    {enrollment.application.withdrawPreference.toLowerCase()}
                  </li>
                  <li>Location: {enrollment.application.location}</li>
                </ul>
              )}
              <p className="text-amber-100/80">
                Once approved, you will be emailed about every Airfarming
                activity — drops, float moves, and weekly progress.
              </p>
            </div>
          )}
          {enrollment.status === "REJECTED" && (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Your last application was not approved
              {enrollment.rejectionReason
                ? `: ${enrollment.rejectionReason}`
                : "."}{" "}
              You may apply again below.
            </p>
          )}
          {enrollment.canApply && (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submitApplication();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Full name
                  </label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your legal name"
                    required
                    minLength={2}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Age</label>
                  <Input
                    type="number"
                    min={18}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="18+"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Location
                  </label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City, country"
                    required
                    minLength={2}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Amount you plan to invest (USDT)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step="0.01"
                    value={plannedInvestment}
                    onChange={(e) => setPlannedInvestment(e.target.value)}
                    placeholder="1000"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    How you want to withdraw
                  </label>
                  <select
                    className="flex h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    value={withdrawPreference}
                    onChange={(e) =>
                      setWithdrawPreference(
                        e.target.value as AirfarmingApplyPayload["withdrawPreference"],
                      )
                    }
                  >
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  required
                />
                <span>
                  I agree to the Airfarming terms: I will respect the schedule
                  and commitments I set, and I will not invest money I cannot
                  afford to lose. I understand Airfarming involves risk and
                  that yield is not guaranteed beyond the stated weekly floor
                  mechanics.
                </span>
              </label>

              <Button
                type="submit"
                disabled={
                  busy ||
                  status?.globallyPaused ||
                  !acceptTerms ||
                  !fullName.trim() ||
                  !email.trim() ||
                  !location.trim() ||
                  !age ||
                  !plannedInvestment
                }
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Submit Airfarming application"
                )}
              </Button>
            </form>
          )}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-emerald-300">{message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-sky-300/80">
          Airfarming
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">
          Scheduled yield drops
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Commit cash from your wallet. Between drops, funds stay in your cash
          wallet. Before each drop, the system parks them in Airfarming
          automatically. You are guaranteed at least{" "}
          {Math.round((week?.floorRate ?? 0.5) * 100)}% of your weekly
          commitment by UTC week end.
        </p>
        {status?.globallyPaused && (
          <p className="mt-3 text-sm text-amber-300">
            Airfarming is paused for maintenance.
          </p>
        )}
        <p className="mt-3 text-sm text-gray-300">
          Phase: <strong className="text-white">{PHASE_LABELS[status?.phase ?? "idle"] ?? status?.phase}</strong>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-black/20 p-3">
            <div className="text-xs text-gray-500">Cash wallet</div>
            <div className="font-medium text-white">
              {formatCurrency(status?.cashWalletUsd ?? 0)}
            </div>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="text-xs text-gray-500">Working (AF)</div>
            <div className="font-medium text-white">
              {formatCurrency(status?.airfarmingWalletUsd ?? 0)}
            </div>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="text-xs text-gray-500">Committed</div>
            <div className="font-medium text-white">
              {formatCurrency(status?.committedUsd ?? 0)}
            </div>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="text-xs text-gray-500">Week yield</div>
            <div className="font-medium text-emerald-300">
              {formatCurrency(week?.yieldUsd ?? 0)}
            </div>
          </div>
        </div>
      </div>

      {week && week.investmentUsd > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-medium text-white">Weekly floor progress</h3>
          <p className="mt-1 text-xs text-gray-500">
            Week of {week.weekStart} (UTC) · target{" "}
            {formatCurrency(week.floorTargetUsd)} ({Math.round(week.floorRate * 100)}% of{" "}
            {formatCurrency(week.investmentUsd)})
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{ width: `${week.progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-gray-400">
            {formatCurrency(week.yieldUsd)} earned ·{" "}
            {formatCurrency(week.floorRemainingUsd)} remaining to floor
          </p>
        </div>
      )}

      {next && (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5">
          <h3 className="font-medium text-white">Next drop</h3>
          <p className="mt-2 text-sm text-gray-300">
            Due in <strong>{formatCountdown(next.secondsRemaining)}</strong> ·{" "}
            {next.percent}% on balance {formatCurrency(next.minBalance)}–
            {formatCurrency(next.maxBalance)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {new Date(next.dueAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            (local)
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <h3 className="font-medium text-white">Commit from cash</h3>
          <p className="text-xs text-gray-500">
            No fee on allocation. Funds remain in cash until a drop prepares.
          </p>
          <Input
            type="number"
            min={1}
            step="0.01"
            placeholder="Amount USDT"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button
            disabled={busy || !allocValue || allocValue <= 0 || status?.globallyPaused}
            onClick={() => void allocate()}
            className="w-full"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Allocate"}
          </Button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <h3 className="font-medium text-white">Reduce commitment</h3>
          <p className="text-xs text-gray-500">
            Only when idle (not during drop prep).
          </p>
          <Input
            type="number"
            min={1}
            step="0.01"
            placeholder="Amount USDT"
            value={deallocAmount}
            onChange={(e) => setDeallocAmount(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={
              busy ||
              !deallocValue ||
              deallocValue <= 0 ||
              deallocValue > (status?.committedUsd ?? 0)
            }
            onClick={() => void deallocate()}
            className="w-full"
          >
            Deallocate
          </Button>
        </div>
      </div>

      {status?.history && status.history.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-medium text-white">Recent drops</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {status.history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2"
              >
                <span className="text-gray-400">
                  {new Date(h.dueAt).toLocaleDateString()} · {h.status}
                </span>
                <span className="text-white">
                  {h.profitAmount != null
                    ? formatCurrency(h.profitAmount)
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-emerald-300">{message}</p>}

      <p className="text-xs text-gray-500">
        <Link href="/wallet" className="text-primary hover:underline">
          Cash wallet
        </Link>
        {" · "}
        <Link href="/invest" className="text-primary hover:underline">
          Smart Invest
        </Link>
      </p>
    </div>
  );
}
