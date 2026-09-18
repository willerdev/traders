"use client";

import { Loader2 } from "lucide-react";
import type { UserMt5HistoryItem } from "@/lib/api";
import { fmtMt5Price, Mt5Pnl } from "@/components/mt5/mt5-ui";
import { cn } from "@/lib/utils";

type Props = {
  items: UserMt5HistoryItem[];
  loading: boolean;
  error: string | null;
  dealCount?: number;
  selectedId?: string | null;
  onSelect?: (item: UserMt5HistoryItem) => void;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function friendlyHistoryError(error: string) {
  if (/<!DOCTYPE|<\s*html/i.test(error)) {
    return "Could not refresh trade history. Showing cached trades.";
  }
  return error;
}

export function TradingHistoryPanel({
  items,
  loading,
  error,
  dealCount = 0,
  selectedId = null,
  onSelect,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Today
        </p>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
        )}
      </div>
      {error && (
        <p className="mt-2 line-clamp-2 shrink-0 text-xs text-danger">
          {friendlyHistoryError(error)}
        </p>
      )}
      {items.length === 0 && !loading ? (
        <p className="px-1 py-8 text-center text-xs text-muted">
          No closed trades today.
        </p>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
          {items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect?.(row)}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                  selectedId === row.id
                    ? "bg-primary/15 ring-1 ring-primary/40"
                    : "bg-navy/70 hover:bg-navy",
                )}
              >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {row.symbol}
                  </p>
                  <p className="text-muted">
                    <span
                      className={cn(
                        row.direction.toUpperCase() === "BUY"
                          ? "text-[#4a9eff]"
                          : "text-[#ff5252]",
                      )}
                    >
                      {row.direction}
                    </span>
                    {" · "}
                    {formatWhen(row.closedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <Mt5Pnl value={row.pnl ?? 0} className="text-xs" />
                  <p className="text-[10px] text-muted">
                    {fmtMt5Price(row.entryPrice)} → {fmtMt5Price(row.exitPrice)}
                  </p>
                </div>
              </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
