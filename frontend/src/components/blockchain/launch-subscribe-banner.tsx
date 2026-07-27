"use client";

import { useState } from "react";
import { Bell, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";

export function LaunchSubscribeBanner() {
  const userEmail = useAuthStore((s) => s.user?.email) ?? "";
  const [email, setEmail] = useState(userEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setStatus("error");
      setMessage("Enter a valid email so we can notify you.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const token = (() => {
        try {
          const raw = localStorage.getItem("trp-auth");
          if (!raw) return null;
          return (JSON.parse(raw) as { state?: { token?: string } }).state
            ?.token ?? null;
        } catch {
          return null;
        }
      })();
      const res = await fetch("/api/v1/blockchain/launch/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (body as { message?: string }).message || "Could not subscribe",
        );
      }
      setStatus("done");
      setMessage(
        (body as { message?: string }).message ||
          "You're on the list — we'll email you when the vault opens.",
      );
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Subscribe failed");
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-sky-500/35 bg-gradient-to-br from-sky-500/15 via-[var(--color-surface)] to-emerald-500/10 p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-sky-400/10 blur-2xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">
            <Rocket className="h-3.5 w-3.5" />
            Still launching · mainnet soon
          </div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            On-chain returns are live on Polygon Amoy
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            We&apos;re live on Polygon Amoy. Subscribe for enrollment alerts when
            mainnet opens —{" "}
            <span className="font-semibold text-emerald-300">
              15% per day ROI
            </span>
            , investments from{" "}
            <span className="font-semibold text-sky-300">$2,000 and above</span>{" "}
            only.
          </p>
        </div>

        <form
          onSubmit={(e) => void subscribe(e)}
          className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center"
        >
          <div className="relative min-w-0 flex-1">
            <Bell className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              disabled={status === "done" || status === "loading"}
              className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-black/25 pl-9 pr-3 text-sm outline-none focus:border-primary disabled:opacity-70"
              aria-label="Email for launch notification"
            />
          </div>
          <Button
            type="submit"
            disabled={status === "loading" || status === "done"}
            className="h-10 shrink-0"
          >
            {status === "done"
              ? "Subscribed"
              : status === "loading"
                ? "Saving…"
                : "Notify me"}
          </Button>
        </form>
      </div>
      {message && (
        <p
          className={`relative mt-3 text-xs ${
            status === "error" ? "text-rose-300" : "text-emerald-300"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
