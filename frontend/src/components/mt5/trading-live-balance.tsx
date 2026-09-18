"use client";

import { Radio } from "lucide-react";
import { fmtMt5Price } from "@/components/mt5/mt5-ui";
import { cn } from "@/lib/utils";

type Props = {
  equity: number;
  balance: number;
  currency: string;
  live: boolean;
  linked: boolean;
  floating?: number;
  dayPnl?: number;
};

export function TradingLiveBalance({
  equity,
  balance,
  currency,
  live,
  linked,
  floating = 0,
  dayPnl = 0,
}: Props) {
  if (!linked) return null;

  return (
    <section className="mx-3 shrink-0 md:mx-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Equity
          </p>
          <p className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-4xl font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-5xl">
              {fmtMt5Price(equity)}
            </span>
            <span className="pb-0.5 text-lg font-semibold text-muted">
              {currency}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
            <span>
              Balance{" "}
              <strong className="font-semibold tabular-nums text-foreground">
                {fmtMt5Price(balance)}
              </strong>
            </span>
            <span>
              Floating{" "}
              <strong
                className={cn(
                  "font-semibold tabular-nums",
                  floating > 0
                    ? "text-success"
                    : floating < 0
                      ? "text-danger"
                      : "text-foreground",
                )}
              >
                {fmtMt5Price(floating)}
              </strong>
            </span>
            <span>
              Day PnL{" "}
              <strong
                className={cn(
                  "font-semibold tabular-nums",
                  dayPnl > 0
                    ? "text-success"
                    : dayPnl < 0
                      ? "text-danger"
                      : "text-foreground",
                )}
              >
                {fmtMt5Price(dayPnl)}
              </strong>
            </span>
          </div>
        </div>

        <span
          className={cn(
            "inline-flex w-fit items-center gap-2 self-start rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide sm:self-center",
            live
              ? "bg-success/15 text-success"
              : "past-data-label bg-amber-500/15 text-amber-300",
          )}
        >
          {live ? (
            <>
              <span className="live-status-dot text-success" aria-hidden />
              Live
            </>
          ) : (
            <>
              <Radio className="h-3.5 w-3.5" />
              Past data
            </>
          )}
        </span>
      </div>
    </section>
  );
}
