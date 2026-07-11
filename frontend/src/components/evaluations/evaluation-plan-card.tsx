"use client";

import type { ReactNode } from "react";
import { Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import {
  formatEvaluationSize,
  type EvaluationPlanRules,
  type EvaluationPlanTier,
} from "@/lib/evaluation-plans";

function RuleRow({
  label,
  value,
  compact,
}: {
  label: string;
  value: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2",
        compact ? "py-1.5 text-xs" : "py-2 text-sm",
      )}
    >
      <span className="flex items-center gap-1 text-muted">
        {label}
        <Info className="h-3 w-3 opacity-40" />
      </span>
      <span className="font-medium text-[var(--color-foreground)]">{value}</span>
    </div>
  );
}

/** Compact card for desktop comparison grid. */
export function EvaluationPlanCard({
  tier,
  rules,
  type,
  highlighted,
  onStart,
  loading,
}: {
  tier: EvaluationPlanTier;
  rules: EvaluationPlanRules;
  type: string;
  highlighted?: boolean;
  onStart: () => void;
  loading?: boolean;
}) {
  const isZero = type === "ZERO";

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-2xl border p-5 transition-all hover:-translate-y-0.5",
        highlighted
          ? "border-primary/50 bg-primary/10 shadow-lg shadow-primary/10"
          : "glass-card border-[var(--color-border)]",
      )}
    >
      {highlighted ? (
        <Badge variant="gold" className="absolute -top-3 left-4 gap-1">
          <Sparkles className="h-3 w-3" />
          Popular
        </Badge>
      ) : null}

      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Program size
          </p>
          <p className="text-2xl font-bold">{formatEvaluationSize(tier.evaluationSize)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Fee
          </p>
          <p className="text-xl font-bold text-primary">
            {formatCurrency(tier.feeUsdt)}
          </p>
        </div>
      </div>

      <Button className="mb-4 w-full" onClick={onStart} disabled={loading}>
        Start Evaluation
      </Button>

      <div className="space-y-0 divide-y divide-[var(--color-border)]">
        {!isZero ? (
          <RuleRow
            label="Profit target"
            compact
            value={
              rules.profitTargetPhase1 != null
                ? `${rules.profitTargetPhase1}%`
                : "—"
            }
          />
        ) : (
          <RuleRow
            label="Consistency"
            compact
            value={`${rules.consistencyPercent}%`}
          />
        )}
        <RuleRow label="Max loss" compact value={`${rules.maxLossPercent}%`} />
        <RuleRow
          label="Daily loss"
          compact
          value={`${rules.dailyLossPercent}%`}
        />
        <RuleRow label="Split" compact value={rules.profitSplitLabel} />
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        Avg reward{" "}
        <span className="font-semibold text-rank-gold">
          {formatCurrency(tier.avgFirstReward)}
        </span>
      </p>
    </article>
  );
}
