"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type EvaluationEnrollment } from "@/lib/api";
import { formatEvaluationSize } from "@/lib/evaluation-plans";
import { formatCurrency } from "@/lib/utils";

function ProgressBar({
  label,
  current,
  floor,
  start,
}: {
  label: string;
  current: number | null;
  floor: number | null;
  start: number | null;
}) {
  if (current == null || floor == null || start == null || start <= 0) {
    return null;
  }
  const used = Math.max(0, ((start - current) / start) * 100);
  const pct = Math.min(100, Math.max(0, used));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span>Floor {formatCurrency(floor)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-danger transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function EvaluationStatusCard() {
  const [enrollment, setEnrollment] = useState<EvaluationEnrollment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.evaluations
      .getActive()
      .then(setEnrollment)
      .catch(() => setEnrollment(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (!enrollment) {
    return (
      <Card className="glass-card border border-[var(--color-border)]">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted">Evaluation Programs</p>
            <p className="font-semibold">No active evaluation</p>
            <p className="text-sm text-muted">
              Start a funded evaluation and trade on MT5 with clear risk rules.
            </p>
          </div>
          <Button asChild>
            <Link href="/evaluations">Browse programs</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (enrollment.status === "BREACHED") {
    return (
      <Card className="border border-danger/40 bg-danger/5">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div>
              <p className="font-semibold text-danger">Evaluation ended</p>
              <p className="text-sm text-muted">
                {enrollment.breachReason ?? "Risk limit reached"}. MT5 access is
                revoked until you start a new program.
              </p>
            </div>
          </div>
          <Button asChild variant="danger">
            <Link href="/evaluations">Start new program</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border border-primary/30">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted">Active evaluation</p>
              <p className="text-lg font-semibold">
                {formatEvaluationSize(enrollment.evaluationSize)} ·{" "}
                {enrollment.type.replace("_", " ")}
              </p>
            </div>
          </div>
          <Badge variant="success">{enrollment.status}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-muted">Equity</p>
            <p className="font-semibold">
              {enrollment.currentEquity != null
                ? formatCurrency(enrollment.currentEquity)
                : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-muted">Max loss</p>
            <p className="font-semibold">{enrollment.rules.maxLossPercent}%</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-muted">Daily loss</p>
            <p className="font-semibold">{enrollment.rules.dailyLossPercent}%</p>
          </div>
        </div>

        <ProgressBar
          label="Drawdown vs max loss"
          current={enrollment.currentEquity}
          floor={enrollment.maxLossFloor}
          start={enrollment.startEquity}
        />
        <ProgressBar
          label="Today's drawdown"
          current={enrollment.currentEquity}
          floor={enrollment.dailyLossFloor}
          start={enrollment.dayStartEquity}
        />

        <div className="flex gap-2">
          <Button asChild variant="secondary" className="flex-1">
            <Link href="/mt5">Open MT5</Link>
          </Button>
          <Button asChild variant="ghost" className="flex-1">
            <Link href="/evaluations">View programs</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
