"use client";

import { AlertCircle } from "lucide-react";
import type { MatchedDuplicateSignal } from "@/lib/api";

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

export function DuplicateRejectionCard({
  match,
  message,
}: {
  match: MatchedDuplicateSignal;
  message?: string;
}) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="min-w-0 space-y-3">
          <div>
            <p className="font-semibold text-danger">
              Setup not accepted — too similar to a recent signal
            </p>
            {message && <p className="mt-1 text-muted">{message}</p>}
          </div>

          <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2 text-foreground">
            <p>
              <span className="text-muted">Trader: </span>
              <span className="font-medium">@{match.traderName}</span>
            </p>
            <p>
              <span className="text-muted">Setup: </span>
              <span className="font-medium">
                {match.symbol} {match.direction}
              </span>
            </p>
            <p>
              <span className="text-muted">Entry: </span>
              <span className="font-mono">
                {match.entryMin} – {match.entryMax}
              </span>
            </p>
            <p>
              <span className="text-muted">SL / TP: </span>
              <span className="font-mono">
                {match.stopLoss} / {match.takeProfit}
              </span>
            </p>
            <p>
              <span className="text-muted">Submitted: </span>
              {formatRelativeTime(match.submittedAt)}
            </p>
            <p>
              <span className="text-muted">Distance: </span>
              <span className="font-medium text-danger">
                {match.pipDistance} pips from your entry
              </span>
            </p>
          </div>

          <p className="text-xs text-muted">
            Change your entry by more than 10 pips to submit an original setup.
          </p>
        </div>
      </div>
    </div>
  );
}
