"use client";

import { Check, Loader2, X } from "lucide-react";
import {
  TX_LIFECYCLE_LABELS,
  TX_LIFECYCLE_ORDER,
  type TxLifecycleStage,
  type TxProgress,
} from "@/blockchain/types/tx-lifecycle";
import { cn } from "@/lib/utils";

export function TxLifecycleProgress({ progress }: { progress: TxProgress }) {
  if (progress.stage === "idle") return null;

  const failed = progress.stage === "failed";
  const currentIdx = TX_LIFECYCLE_ORDER.indexOf(
    progress.stage === "failed" ? "preparing" : progress.stage,
  );

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {failed ? "Transaction Failed" : TX_LIFECYCLE_LABELS[progress.stage]}
        </p>
        {!failed && progress.stage !== "completed" && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {TX_LIFECYCLE_ORDER.map((stage, i) => {
          const done =
            !failed &&
            (i < currentIdx ||
              progress.stage === "completed" ||
              progress.stage === "confirmed");
          const active = !failed && stage === progress.stage;
          return (
            <li
              key={stage}
              className={cn(
                "rounded-xl border px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wide",
                done && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
                active && "border-primary/50 bg-primary/15 text-sky-300",
                !done && !active && "border-white/5 text-muted",
                failed && "border-rose-500/20 text-rose-300/70",
              )}
            >
              <span className="mb-1 flex justify-center">
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : failed && active ? (
                  <X className="h-3.5 w-3.5" />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-current opacity-40" />
                )}
              </span>
              {TX_LIFECYCLE_LABELS[stage as TxLifecycleStage]}
            </li>
          );
        })}
      </ol>

      {(progress.message || progress.error) && (
        <p className="mt-3 text-xs text-muted">
          {progress.error || progress.message}
          {progress.hash ? (
            <>
              {" · "}
              <a
                href={progress.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                View on explorer
              </a>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
