"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type DailyIncomeEntry } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";

type Props = {
  investmentBalance: number;
  dailyYieldPercent: number;
  walletEarnings: number;
  yieldPaused?: boolean;
  compact?: boolean;
};

function project(balance: number, dailyPercent: number, days: number) {
  if (balance <= 0 || dailyPercent <= 0) return 0;
  return Math.round(balance * (dailyPercent / 100) * days * 100) / 100;
}

export function InvestmentReturnsPanel({
  investmentBalance,
  dailyYieldPercent,
  walletEarnings,
  yieldPaused,
  compact,
}: Props) {
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
              {formatCurrency(investmentBalance)}
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
                +{formatCurrency(row.value)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-400">
          <span>
            Lifetime yield:{" "}
            <strong className="text-white">{formatCurrency(walletEarnings)}</strong>
          </span>
          <span>
            Last 7 days:{" "}
            <strong className="text-emerald-300">
              +{formatCurrency(last7)}
            </strong>
          </span>
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
                    {e.yieldPercent}% on {formatCurrency(e.baseBalance)}
                  </p>
                </div>
                <span className="font-semibold tabular-nums text-emerald-400">
                  +{formatCurrency(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
