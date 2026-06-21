"use client";

import { motion } from "framer-motion";
import { cn, formatCurrency, formatPercent, TIER_BG } from "@/lib/utils";
import { TrendingUp, TrendingDown, Target, Award, Flame, AlertTriangle } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
  icon: React.ReactNode;
  delay?: number;
}

export function StatCard({ label, value, change, positive, icon, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="glass-card rounded-2xl border border-white/10 p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          {change && (
            <p
              className={cn(
                "mt-1 flex items-center gap-1 text-xs font-medium",
                positive ? "text-success" : "text-danger",
              )}
            >
              {positive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {change}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">{icon}</div>
      </div>
    </motion.div>
  );
}

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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Virtual Balance"
        value={formatCurrency(balance)}
        icon={<Target className="h-5 w-5" />}
        delay={0}
      />
      <StatCard
        label="Weekly Profit"
        value={formatCurrency(weeklyProfit)}
        positive={weeklyProfit >= 0}
        change={weeklyProfit >= 0 ? "Profitable week" : "In drawdown"}
        icon={<TrendingUp className="h-5 w-5" />}
        delay={0.1}
      />
      <StatCard
        label="Win Rate"
        value={formatPercent(winRate)}
        icon={<Award className="h-5 w-5" />}
        delay={0.2}
      />
      <StatCard
        label="Leaderboard Rank"
        value={rank ? `#${rank}` : "Unranked"}
        icon={<Trophy className="h-5 w-5" />}
        delay={0.3}
      />

      <div className="glass-card rounded-2xl border border-white/10 p-5 sm:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Current Tier
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-bold",
                  TIER_BG[tier] ?? TIER_BG.BRONZE,
                )}
              >
                {tier}
              </span>
              <span className="text-2xl font-bold text-white">{score} pts</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Max Drawdown</p>
            <p className="text-lg font-semibold text-danger">
              {formatPercent(drawdown)}
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-white/10 p-5">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Win Streak
          </p>
        </div>
        <p className="mt-2 text-2xl font-bold text-success">{consecutiveWins}</p>
      </div>

      <div className="glass-card rounded-2xl border border-white/10 p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-danger" />
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Loss Streak
          </p>
        </div>
        <p className="mt-2 text-2xl font-bold text-danger">{consecutiveLosses}</p>
      </div>
    </div>
  );
}

function Trophy({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 3h14M9 3v2a3 3 0 003 3v0a3 3 0 003-3V3M5 3a2 2 0 00-2 2v1a4 4 0 004 4h0M19 3a2 2 0 012 2v1a4 4 0 01-4 4h0M7 14v4M17 14v4M12 14v4M9 18h6"
      />
    </svg>
  );
}
