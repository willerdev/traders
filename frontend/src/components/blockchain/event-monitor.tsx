"use client";

import { ExternalLink } from "lucide-react";
import type { ContractEvent } from "@/lib/blockchain/types";
import {
  formatWhen,
  GlassCard,
  shortAddr,
  Skeleton,
} from "./ui-kit";

export function EventMonitor({
  events,
  loading,
}: {
  events: ContractEvent[];
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-72" />;

  return (
    <GlassCard title="Event Monitor">
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-sky-300">{ev.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  Block {ev.blockNumber} · {shortAddr(ev.wallet, 4)}
                </p>
                <p className="text-[11px] text-muted">{formatWhen(ev.timestamp)}</p>
              </div>
              <a
                href={ev.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary"
                title={ev.transactionHash}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
