"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PreflightCheck } from "@/blockchain/services/preflight";
import { explorerAddress } from "@/blockchain/config/contract";

function CircleIcon({ status }: { status: PreflightCheck["status"] }) {
  if (status === "pass") {
    return <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />;
  }
  if (status === "fail") {
    return <XCircle className="h-5 w-5 text-rose-400" aria-hidden />;
  }
  if (status === "running") {
    return (
      <Loader2 className="h-5 w-5 animate-spin text-sky-400" aria-hidden />
    );
  }
  return <Circle className="h-5 w-5 text-slate-500" aria-hidden />;
}

export function VaultPreflightScreen({
  checks,
  address,
  running,
  onRetry,
}: {
  checks: PreflightCheck[];
  address: string;
  running: boolean;
  onRetry: () => void;
}) {
  const passed = checks.filter((c) => c.status === "pass").length;
  const total = checks.length;
  const failed = checks.some((c) => c.status === "fail");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-xl space-y-6 py-6"
    >
      <div className="space-y-2 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
          Vault readiness
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          Checking on-chain connection
        </h1>
        <p className="text-sm text-muted">
          The dashboard opens only when every check passes
          {address ? (
            <>
              {" "}
              for{" "}
              <a
                href={explorerAddress(address)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sky-300/90 underline-offset-2 hover:underline"
              >
                {address.slice(0, 8)}…{address.slice(-6)}
              </a>
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/60 p-4 sm:p-5">
        <ul className="space-y-3">
          {checks.map((check, i) => (
            <motion.li
              key={check.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-start gap-3"
            >
              <span className="mt-0.5 shrink-0">
                <CircleIcon status={check.status} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={
                    check.status === "fail"
                      ? "text-sm font-medium text-rose-200"
                      : check.status === "pass"
                        ? "text-sm font-medium text-emerald-100"
                        : "text-sm font-medium text-foreground"
                  }
                >
                  {check.label}
                </p>
                {check.detail ? (
                  <p className="mt-0.5 text-xs text-muted">{check.detail}</p>
                ) : null}
              </div>
            </motion.li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
          <p className="text-xs text-muted">
            {passed}/{total} passed
            {failed ? " · fix failing items, then retry" : running ? " · running…" : ""}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={running}
            onClick={onRetry}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
            Retry checks
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
