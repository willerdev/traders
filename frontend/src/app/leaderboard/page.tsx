"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, LeaderboardEntry } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatPercent, TIER_BG } from "@/lib/utils";
import { Trophy, Medal } from "lucide-react";

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-5 w-5 text-rank-gold" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-300" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
  return (
    <span className="flex h-5 w-5 items-center justify-center text-sm font-bold text-gray-500">
      {rank}
    </span>
  );
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.leaderboard
      .get()
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
          <p className="mt-2 text-gray-400">
            Real-time rankings based on score, profit, and consistency
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <div className="glass-card rounded-2xl border border-white/10 p-12 text-center">
            <Trophy className="mx-auto h-12 w-12 text-gray-600" />
            <p className="mt-4 text-gray-400">
              No rankings yet. Be the first to submit a signal!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "glass-card flex items-center gap-4 rounded-xl border p-4",
                  entry.rank <= 3 ? "border-white/15" : "border-white/5",
                )}
              >
                <RankIcon rank={entry.rank} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white truncate">
                      {entry.displayName}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-bold",
                        TIER_BG[entry.tier] ?? TIER_BG.BRONZE,
                      )}
                    >
                      {entry.tier}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-4 text-xs text-gray-500">
                    <span>WR: {formatPercent(Number(entry.winRate))}</span>
                    <span>DD: {formatPercent(Number(entry.drawdown))}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-white">{entry.score} pts</p>
                  <p className="text-xs text-success">
                    {formatCurrency(Number(entry.profit))}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-5 gap-3">
          {["Bronze", "Silver", "Gold", "Diamond", "Elite"].map((tier) => (
            <div
              key={tier}
              className="glass-card rounded-xl border border-white/5 p-3 text-center"
            >
              <Badge variant="secondary" className="text-xs">
                {tier}
              </Badge>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
