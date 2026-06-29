"use client";

import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "submit" | "modal";

export function TradeExecutionNotice({
  variant = "submit",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  if (variant === "submit") {
    return (
      <div
        className={cn(
          "rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-100",
          className,
        )}
      >
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
          <div className="space-y-2">
            <p className="font-medium text-sky-200">How submitted setups go live</p>
            <p>
              Submitting queues your setup on <strong>Signal Hub</strong> as a{" "}
              <strong>pending order only</strong> — buy/sell limit or buy/sell stop at
              your entry zone edge. It does not execute at market and does not go live
              until price reaches that level.
            </p>
            <p className="text-sky-200/80">
              <strong>Place trade</strong> (from the setup modal on your dashboard) is
              the only way to go live immediately — market fill now or broker pending at
              entry. Use that when you want direct execution without waiting for Hub limits.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="space-y-2">
          <p className="font-medium text-amber-200">Two ways this setup can go live</p>
          <ul className="list-disc space-y-1.5 pl-4 text-amber-100/90">
            <li>
              <strong>Signal Hub (submit):</strong> pending limit or stop at your entry
              zone — trade opens only when price reaches that level. No market orders.
            </li>
            <li>
              <strong>Place trade:</strong> the only way to go live immediately
              — market now or broker pending at entry. SL/TP sent to the broker directly.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
