"use client";

import { useMemo } from "react";
import Link from "next/link";
import { UserAvatar } from "@/components/layout/user-avatar";
import { fmtMt5Price } from "@/components/mt5/mt5-ui";
import { cn, formatCurrency } from "@/lib/utils";
import type { UserMt5Trade } from "@/lib/api";

export type ApiReadiness = {
  platform: boolean;
  metaApi: boolean;
  metaApiAccount: boolean;
  deriv: boolean;
};

type DayPoint = { date: string; net: number };

function polar(cx: number, cy: number, r: number, angle: number) {
  const a = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

function Donut({
  slices,
  size = 168,
}: {
  slices: Array<{ value: number; color: string; label: string }>;
  size?: number;
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  let angle = 0;
  const parts =
    total <= 0
      ? [{ start: 0, end: 359.9, color: "#243044" }]
      : slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const span = (s.value / total) * 359.9;
            const start = angle;
            const end = angle + span;
            angle = end;
            return { start, end, color: s.color };
          });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40 shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a2438" strokeWidth={18} />
      {parts.map((p, i) => (
        <path
          key={i}
          d={arcPath(cx, cy, r, p.start, p.end)}
          fill="none"
          stroke={p.color}
          strokeWidth={18}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}

function Bars({
  points,
  upColor = "#34d399",
  downColor = "#f87171",
}: {
  points: DayPoint[];
  upColor?: string;
  downColor?: string;
}) {
  const w = 320;
  const h = 96;
  const max = Math.max(1, ...points.map((p) => Math.abs(p.net)));
  const gap = 2;
  const barW = points.length > 0 ? (w - gap * points.length) / points.length : 0;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
      <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#2a3548" strokeWidth="1" />
      {points.map((p, i) => {
        const x = i * (barW + gap);
        const mag = (Math.abs(p.net) / max) * (h / 2 - 4);
        const y = p.net >= 0 ? h / 2 - mag : h / 2;
        return (
          <rect
            key={p.date}
            x={x}
            y={y}
            width={Math.max(barW, 1)}
            height={Math.max(mag, 1)}
            rx={1}
            fill={p.net >= 0 ? upColor : downColor}
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 320;
  const h = 72;
  if (points.length < 2) {
    return <div className="h-[72px] w-full rounded-lg bg-navy/40" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full">
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
    </svg>
  );
}

function Gauge({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const clamped = Math.max(-1, Math.min(1, value === 0 ? 0 : value / (Math.abs(value) + 40)));
  const end = 180 + clamped * 180;
  const color = value > 0 ? "#34d399" : value < 0 ? "#f87171" : "#8b95a8";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 88" className="h-20 w-36">
        <path
          d={arcPath(70, 78, 52, 180, 360)}
          fill="none"
          stroke="#1a2438"
          strokeWidth="12"
        />
        <path
          d={arcPath(70, 78, 52, 180, end)}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-xl font-bold tabular-nums" style={{ color }}>
        {fmtMt5Price(value)}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function StatusDot({ ok, href, label }: { ok: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5"
    >
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          ok ? "bg-success shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-amber-400",
        )}
      />
      <span className="text-xs font-medium text-foreground">{label}</span>
    </Link>
  );
}

export function PerformanceDashboard({
  displayName,
  email,
  avatarUrl,
  deposited,
  withdrawn,
  earned,
  available,
  dailyNets,
  running,
  floating,
  dayPnl,
  apiReady,
}: {
  displayName: string;
  email?: string;
  avatarUrl?: string | null;
  deposited: number;
  withdrawn: number;
  earned: number;
  available: number;
  dailyNets: DayPoint[];
  running: UserMt5Trade[];
  floating: number;
  dayPnl: number;
  apiReady: ApiReadiness;
}) {
  const slices = [
    { value: deposited, color: "#38bdf8", label: "Deposits" },
    { value: withdrawn, color: "#f87171", label: "Withdraws" },
    { value: earned, color: "#34d399", label: "Yield" },
  ];
  const equityCurve = useMemo(() => {
    let run = 0;
    return dailyNets.map((d) => {
      run += d.net;
      return run;
    });
  }, [dailyNets]);
  const apisOn =
    apiReady.platform && apiReady.metaApi && apiReady.metaApiAccount && apiReady.deriv;

  const maxAbsTrade = Math.max(
    1,
    ...running.map((t) => Math.abs(t.profit ?? 0)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
        <div className="flex items-center gap-3">
          <UserAvatar name={displayName} src={avatarUrl} size="lg" />
          <div>
            <p className="text-xl font-bold text-white">{displayName}</p>
            {email && <p className="text-xs text-muted">{email}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot ok={apiReady.platform} href="/wallet" label="Wallet API" />
          <StatusDot ok={apiReady.metaApi} href="/settings" label="MetaAPI" />
          <StatusDot ok={apiReady.metaApiAccount} href="/mt5" label="MT5 account" />
          <StatusDot ok={apiReady.deriv} href="/deriv" label="Deriv" />
          <span
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-bold uppercase",
              apisOn
                ? "bg-success/15 text-success"
                : "bg-amber-500/15 text-amber-300",
            )}
          >
            {apisOn ? "APIs ready" : "Setup incomplete"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Deposits · Withdraws · Yield
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Donut slices={slices} />
            <ul className="space-y-2 text-xs">
              {slices.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: s.color }}
                  />
                  <span className="text-muted">{s.label}</span>
                  <span className="ml-auto font-semibold tabular-nums text-foreground">
                    {formatCurrency(s.value)}
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-2 border-t border-white/10 pt-2">
                <span className="text-muted">Available</span>
                <span className="ml-auto font-semibold tabular-nums text-foreground">
                  {formatCurrency(available)}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Daily net
          </p>
          <Bars points={dailyNets} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Performance
          </p>
          <Sparkline points={equityCurve} />
          <Gauge value={dayPnl} label="Day PnL" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Running trades
            </p>
            <span className="text-xs tabular-nums text-muted">
              {running.length} · float {fmtMt5Price(floating)}
            </span>
          </div>
          {running.length === 0 ? (
            <div className="mt-6 flex h-24 items-center justify-center text-xs text-muted">
              No open positions
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {running.slice(0, 8).map((t) => {
                const pnl = t.profit ?? 0;
                const width = `${Math.max(8, (Math.abs(pnl) / maxAbsTrade) * 100)}%`;
                return (
                  <li key={t.positionId ?? t.orderId ?? t.symbol} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-foreground">
                        {t.symbol}{" "}
                        <span className="font-normal text-muted">{t.direction}</span>
                      </span>
                      <span
                        className={cn(
                          "tabular-nums",
                          pnl > 0
                            ? "text-success"
                            : pnl < 0
                              ? "text-danger"
                              : "text-muted",
                        )}
                      >
                        {fmtMt5Price(pnl)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-navy">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          pnl >= 0 ? "bg-success" : "bg-danger",
                        )}
                        style={{ width }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-around rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <Gauge value={floating} label="Floating" />
          <Gauge value={dayPnl + floating} label="Day + float" />
        </div>
      </div>
    </div>
  );
}
