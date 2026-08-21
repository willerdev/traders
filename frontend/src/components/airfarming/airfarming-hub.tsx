"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type AirfarmingStatus } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
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
  const [status, setStatus] = useState<AirfarmingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [deallocAmount, setDeallocAmount] = useState("");

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

  async function apply() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await api.airfarming.apply();
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
            <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Your application is <strong>pending review</strong>. We will email
              you when it is approved.
            </p>
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
            <Button
              className="mt-5"
              disabled={busy || status?.globallyPaused}
              onClick={() => void apply()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Apply for Airfarming"
              )}
            </Button>
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
