"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DollarSign, Sparkles } from "lucide-react";
import { api, type PublicPayoutFeed } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function tierLabel(tier: string) {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function sourceLabel(source: string) {
  if (source === "TP_REWARD") return "TP reward";
  if (source === "PROFIT_SHARE") return "Profit share";
  return "Weekly payout";
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function RecentPayoutsShowcase() {
  const [feed, setFeed] = useState<PublicPayoutFeed | null>(null);

  useEffect(() => {
    api.public
      .recentPayouts(12)
      .then(setFeed)
      .catch(() => setFeed(null));
  }, []);

  const items = feed?.items ?? [];
  const doubled = items.length > 0 ? [...items, ...items] : [];

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <Badge variant="gold" className="mb-4 gap-1">
          <Sparkles className="h-3.5 w-3.5" />
          Real trader payouts
        </Badge>
        <h2 className="text-3xl font-bold text-white">Traders Getting Paid</h2>
        <p className="mt-3 text-gray-400">
          Weekly rewards sent to active performers on the platform
          {feed && feed.totalPaid > 0 && (
            <>
              {" "}
              — <strong className="text-white">{formatCurrency(feed.totalPaid)}</strong>{" "}
              paid out so far
            </>
          )}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="mt-10 glass-card rounded-2xl border border-white/10 p-8 text-center text-sm text-gray-500">
          Payout highlights appear here as traders receive rewards.
        </div>
      ) : (
        <div className="relative mt-10 overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[var(--background)] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[var(--background)] to-transparent" />
          <motion.div
            className="flex w-max gap-4"
            animate={{ x: ["0%", "-50%"] }}
            transition={{
              duration: Math.max(items.length * 4, 24),
              repeat: Infinity,
              ease: "linear",
            }}
          >
            {doubled.map((item, i) => (
              <div
                key={`${item.displayName}-${item.paidAt}-${i}`}
                className="glass-card w-72 shrink-0 rounded-2xl border border-rank-gold/20 bg-rank-gold/5 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.displayName}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {tierLabel(item.tier)} · {sourceLabel(item.source)}
                    </p>
                  </div>
                  <div className="rounded-full bg-rank-gold/15 p-2 text-rank-gold">
                    <DollarSign className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-4 text-2xl font-bold text-rank-gold">
                  {formatCurrency(item.amount)}
                </p>
                <p className="mt-1 text-xs text-gray-500">{timeAgo(item.paidAt)}</p>
              </div>
            ))}
          </motion.div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.slice(0, 3).map((item, i) => (
          <motion.div
            key={`${item.displayName}-grid-${i}`}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
          >
            <span className="text-white">{item.displayName}</span>
            <span className="text-gray-500"> received </span>
            <span className="font-semibold text-rank-gold">
              {formatCurrency(item.amount)}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
