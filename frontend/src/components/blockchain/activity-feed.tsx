"use client";

import { ExternalLink } from "lucide-react";
import type { ActivityItem } from "@/lib/blockchain/types";
import {
  formatWhen,
  GlassCard,
  shortAddr,
  Skeleton,
  TxStatusBadge,
} from "./ui-kit";

export function ActivityFeed({
  items,
  loading,
}: {
  items: ActivityItem[];
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-80" />;

  return (
    <GlassCard title="Contract Activity Feed">
      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {items.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition hover:border-primary/20"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold capitalize">
                {row.type.replace(/_/g, " ")}
              </p>
              <p className="font-mono text-xs text-muted">
                {shortAddr(row.wallet, 4)} · {row.amount} BNB
              </p>
            </div>
            <div className="flex items-center gap-2 text-right">
              <div>
                <TxStatusBadge status={row.status} />
                <p className="mt-1 text-[11px] text-muted">
                  {formatWhen(row.timestamp)}
                </p>
              </div>
              <a
                href={row.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:opacity-80"
                title={row.hash}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">No activity yet</p>
        )}
      </div>
    </GlassCard>
  );
}
