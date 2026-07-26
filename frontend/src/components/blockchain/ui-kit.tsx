"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-white/5 dark:bg-white/5 light:bg-slate-200/80",
        className,
      )}
    />
  );
}

export function AnimatedCounter({
  value,
  decimals = 2,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    let frame = 0;
    const start = display;
    const diff = value - start;
    if (Math.abs(diff) < 1e-9) {
      setDisplay(value);
      return;
    }
    const steps = 24;
    const id = setInterval(() => {
      frame += 1;
      const next = start + (diff * frame) / steps;
      if (frame >= steps) {
        setDisplay(value);
        clearInterval(id);
      } else {
        setDisplay(next);
      }
    }, 16);
    return () => clearInterval(id);
    // Animate toward new targets only; ignore mid-animation display.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={className}>
      {prefix}
      {display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

export function StatusDot({
  tone,
  label,
}: {
  tone: "success" | "danger" | "warning" | "info" | "muted";
  label: string;
}) {
  const colors = {
    success: "bg-emerald-400 shadow-emerald-400/40",
    danger: "bg-rose-400 shadow-rose-400/40",
    warning: "bg-amber-400 shadow-amber-400/40",
    info: "bg-sky-400 shadow-sky-400/40",
    muted: "bg-slate-400 shadow-slate-400/20",
  };
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span
        className={cn("h-2.5 w-2.5 rounded-full shadow-[0_0_8px]", colors[tone])}
      />
      {label}
    </span>
  );
}

export function TxStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    failed: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    loading: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        map[status] ?? "bg-white/5 text-muted border-white/10",
      )}
    >
      {status}
    </span>
  );
}

export function GlassCard({
  children,
  className,
  title,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl border border-[var(--color-border)] p-5 transition-all duration-300 hover:border-primary/25",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          {title ? (
            <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function shortAddr(addr: string | null | undefined, size = 4) {
  if (!addr) return "—";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

export function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function Countdown({ target }: { target: string }) {
  const [left, setLeft] = useState("");

  useEffect(() => {
    const tick = () => {
      const ms = new Date(target).getTime() - Date.now();
      if (ms <= 0) {
        setLeft("Ready");
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLeft(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return <span className="font-mono text-sm text-sky-300">{left}</span>;
}
