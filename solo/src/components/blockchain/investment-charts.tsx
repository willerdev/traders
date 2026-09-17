"use client";

import type { InvestmentStatistics } from "@/lib/blockchain/types";
import { GlassCard, Skeleton } from "./ui-kit";

export function InvestmentCharts({
  stats,
  loading,
}: {
  stats: InvestmentStatistics | null;
  loading: boolean;
}) {
  if (loading || !stats) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  const charts = [
    { title: "Daily Deposits", data: stats.dailyDeposits, color: "#38BDF8" },
    { title: "Daily Withdrawals", data: stats.dailyWithdrawals, color: "#F472B6" },
    { title: "TVL Growth", data: stats.tvlGrowth, color: "#34D399" },
    { title: "User Growth", data: stats.userGrowth, color: "#A78BFA" },
    { title: "Rewards Paid", data: stats.rewardsPaid, color: "#FBBF24" },
    { title: "Profit Distribution", data: stats.profitDistribution, color: "#60A5FA" },
    { title: "Network Activity", data: stats.networkActivity, color: "#2DD4BF" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {charts.map((c) => (
          <GlassCard key={c.title} title={c.title}>
            <Sparkline data={c.data.map((d) => d.value)} color={c.color} />
          </GlassCard>
        ))}
      </div>
      <GlassCard title="Monthly Comparison">
        <div className="flex h-40 items-end gap-3">
          {stats.monthlyComparison.map((m) => {
            const max = Math.max(
              ...stats.monthlyComparison.flatMap((x) => [x.deposits, x.withdrawals]),
            );
            return (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-28 w-full items-end justify-center gap-1">
                  <div
                    className="w-2.5 rounded-t bg-sky-400/80"
                    style={{ height: `${(m.deposits / max) * 100}%` }}
                    title={`Deposits ${m.deposits}`}
                  />
                  <div
                    className="w-2.5 rounded-t bg-fuchsia-400/70"
                    style={{ height: `${(m.withdrawals / max) * 100}%` }}
                    title={`Withdrawals ${m.withdrawals}`}
                  />
                </div>
                <span className="text-[11px] text-muted">{m.month}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-sky-400" /> Deposits
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-fuchsia-400" /> Withdrawals
          </span>
        </div>
      </GlassCard>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const w = 320;
  const h = 96;
  const pts = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
      <polygon
        fill={`url(#g-${color.replace("#", "")})`}
        points={`0,${h} ${pts} ${w},${h}`}
      />
    </svg>
  );
}
