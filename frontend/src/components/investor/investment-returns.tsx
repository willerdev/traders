"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type DailyIncomeEntry } from "@/lib/api";
import { cn, formatMoney, type DisplayCurrency } from "@/lib/utils";

type Props = {
  investmentBalance: number;
  dailyYieldPercent: number;
  walletEarnings: number;
  yieldPaused?: boolean;
  compact?: boolean;
  displayCurrency?: DisplayCurrency | null;
};

function project(balance: number, dailyPercent: number, days: number) {
  if (balance <= 0 || dailyPercent <= 0) return 0;
  return Math.round(balance * (dailyPercent / 100) * days * 100) / 100;
}

type ChartPoint = {
  label: string;
  value: number;
};

function linePath(points: ChartPoint[], width = 320, height = 116) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - (point.value / max) * (height - 12);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function InvestmentReturnsPanel({
  investmentBalance,
  dailyYieldPercent,
  walletEarnings,
  yieldPaused,
  compact,
  displayCurrency,
}: Props) {
  const money = (n: number) => formatMoney(n, displayCurrency);
  const [entries, setEntries] = useState<DailyIncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.wallet.incomeJournal(30, 0);
      setEntries(res.items.filter((e) => e.source === "INVESTOR"));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const projections = useMemo(() => {
    const daily = project(investmentBalance, dailyYieldPercent, 1);
    return {
      daily,
      weekly: project(investmentBalance, dailyYieldPercent, 7),
      monthly: project(investmentBalance, dailyYieldPercent, 30),
    };
  }, [investmentBalance, dailyYieldPercent]);

  const last7 = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    return entries
      .filter((e) => new Date(e.creditedAt).getTime() >= cutoff)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [entries]);

  const historyPoints = useMemo<ChartPoint[]>(() => {
    const byDate = new Map(entries.map((entry) => [entry.creditDate, entry.amount]));
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (13 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        label: date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        value: byDate.get(key) ?? 0,
      };
    });
  }, [entries]);

  const growthPoints = useMemo<ChartPoint[]>(
    () =>
      [0, 7, 14, 21, 30].map((days) => ({
        label: days === 0 ? "Now" : `${days}d`,
        value: investmentBalance + project(investmentBalance, dailyYieldPercent, days),
      })),
    [dailyYieldPercent, investmentBalance],
  );

  const growthPath = useMemo(() => linePath(growthPoints), [growthPoints]);
  const growthAreaPath = `${growthPath} L 320 116 L 0 116 Z`;
  const maxHistory = Math.max(...historyPoints.map((point) => point.value), 1);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/50 via-[#0f1419] to-indigo-950/30 p-5",
          compact && "p-4",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/90">
              Smart investment returns
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              Daily yield & projections
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              {dailyYieldPercent}% daily on{" "}
              {money(investmentBalance)}
              {yieldPaused ? " · yield paused" : " · credited ~16:00 Kampala"}
            </p>
          </div>
          <TrendingUp className="h-5 w-5 shrink-0 text-emerald-400" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Est. today", value: projections.daily },
            { label: "Est. 7 days", value: projections.weekly },
            { label: "Est. 30 days", value: projections.monthly },
          ].map((row) => (
            <div
              key={row.label}
              className="rounded-xl border border-white/10 bg-black/25 px-3 py-3"
            >
              <p className="text-xs text-gray-500">{row.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-300">
                +{money(row.value)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-400">
          <span>
            Lifetime yield:{" "}
            <strong className="text-white">{money(walletEarnings)}</strong>
          </span>
          <span>
            Last 7 days:{" "}
            <strong className="text-emerald-300">
              +{money(last7)}
            </strong>
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-white">
                Daily returns
              </h4>
              <p className="mt-0.5 text-xs text-gray-500">
                Actual yield credited over 14 days
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              +{money(last7)} / 7d
            </span>
          </div>

          <div className="mt-4 h-36">
            <svg
              viewBox="0 0 320 116"
              className="h-full w-full overflow-visible"
              role="img"
              aria-label="Actual daily investment returns for the last fourteen days"
            >
              {[29, 58, 87, 116].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="320"
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                />
              ))}
              {historyPoints.map((point, index) => {
                const barWidth = 14;
                const gap = 8;
                const x = index * (barWidth + gap) + 7;
                const barHeight =
                  point.value > 0
                    ? Math.max((point.value / maxHistory) * 100, 3)
                    : 1;
                return (
                  <g key={`${point.label}-${index}`}>
                    <rect
                      x={x}
                      y={116 - barHeight}
                      width={barWidth}
                      height={barHeight}
                      rx="4"
                      fill={
                        point.value > 0
                          ? "rgba(52, 211, 153, 0.85)"
                          : "rgba(255,255,255,0.08)"
                      }
                    >
                      <title>
                        {point.label}: {money(point.value)}
                      </title>
                    </rect>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>{historyPoints[0]?.label}</span>
            <span>{historyPoints[6]?.label}</span>
            <span>{historyPoints[13]?.label}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/30 to-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-white">
                30-day growth projection
              </h4>
              <p className="mt-0.5 text-xs text-gray-500">
                Balance plus estimated wallet yield
              </p>
            </div>
            <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-300">
              {money(growthPoints.at(-1)?.value ?? investmentBalance)}
            </span>
          </div>

          <div className="mt-4 h-36">
            <svg
              viewBox="0 0 320 116"
              className="h-full w-full overflow-visible"
              role="img"
              aria-label="Projected investment value over thirty days"
            >
              <defs>
                <linearGradient id="investment-growth-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.36" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[29, 58, 87, 116].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="320"
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                />
              ))}
              <path d={growthAreaPath} fill="url(#investment-growth-area)" />
              <path
                d={growthPath}
                fill="none"
                stroke="#818cf8"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {growthPoints.map((point, index) => {
                const x = (index / Math.max(growthPoints.length - 1, 1)) * 320;
                const max = Math.max(...growthPoints.map((p) => p.value), 1);
                const y = 116 - (point.value / max) * 104;
                return (
                  <circle
                    key={point.label}
                    cx={x}
                    cy={y}
                    r="4"
                    fill="#111827"
                    stroke="#a5b4fc"
                    strokeWidth="2"
                  >
                    <title>
                      {point.label}: {money(point.value)}
                    </title>
                  </circle>
                );
              })}
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-gray-600">
            {growthPoints.map((point) => (
              <span key={point.label}>{point.label}</span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-gray-600">
            Projection assumes the current daily rate and balance; actual returns
            may vary.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold text-white">Yield history</h4>
            <p className="text-xs text-gray-500">
              Daily interest credited to your wallet
            </p>
          </div>
          <Link href="/journal">
            <Button size="sm" variant="secondary" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Journal
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-10 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">
            No daily credits yet. Yield posts once per day while you have an
            investment balance.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {entries.slice(0, compact ? 8 : 15).map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-white">{e.creditDate}</p>
                  <p className="text-xs text-gray-500">
                    {e.yieldPercent}% on {money(e.baseBalance)}
                  </p>
                </div>
                <span className="font-semibold tabular-nums text-emerald-400">
                  +{money(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
