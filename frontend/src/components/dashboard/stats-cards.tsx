"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Send, TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatCurrency, formatPercent, TIER_BG } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DashboardStatsProps {
  balance: number;
  weeklyProfit: number;
  winRate: number;
  rank: number | null;
  tier: string;
  score: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  drawdown: number;
}

function Metric({
  label,
  value,
  sub,
  positive,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-lg font-bold leading-tight text-white sm:text-xl">
        {value}
      </p>
      {sub && (
        <p
          className={cn(
            "mt-0.5 flex items-center gap-0.5 text-[10px] font-medium",
            positive === undefined
              ? "text-gray-500"
              : positive
                ? "text-success"
                : "text-danger",
          )}
        >
          {positive !== undefined &&
            (positive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            ))}
          {sub}
        </p>
      )}
    </div>
  );
}

export function DashboardStats({
  balance,
  weeklyProfit,
  winRate,
  rank,
  tier,
  score,
  consecutiveWins,
  consecutiveLosses,
  drawdown,
}: DashboardStatsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl border border-white/10 p-3.5 sm:p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/10 pb-3">
        <p className="text-xs text-gray-400">Performance snapshot</p>
        <Link href="/submit">
          <Button size="sm" className="h-8 gap-1.5 px-3 text-xs">
            <Send className="h-3.5 w-3.5" />
            Submit
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Balance" value={formatCurrency(balance)} />
        <Metric
          label="Week P/L"
          value={formatCurrency(weeklyProfit)}
          sub={weeklyProfit >= 0 ? "Profitable" : "Drawdown"}
          positive={weeklyProfit >= 0}
        />
        <Metric label="Win rate" value={formatPercent(winRate)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Rank</p>
          <p className="text-sm font-bold text-white">
            {rank ? `#${rank}` : "Unranked"}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Tier</p>
          <span
            className={cn(
              "mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold",
              TIER_BG[tier] ?? TIER_BG.BRONZE,
            )}
          >
            {tier}
          </span>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Score</p>
          <p className="text-sm font-bold text-white">{score} pts</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Max DD</p>
          <p className="text-sm font-bold text-danger">{formatPercent(drawdown)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-success">
          <span className="text-gray-500">Win streak</span> {consecutiveWins}
        </span>
        <span className="text-danger">
          <span className="text-gray-500">Loss streak</span> {consecutiveLosses}
        </span>
      </div>
    </motion.div>
  );
}
