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
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="flex items-center gap-1.5 text-muted">
        {label}
        <span title={hint} className="cursor-help">
          <Info className="h-3.5 w-3.5 opacity-50" />
        </span>
      </span>
      <span className="text-right font-medium text-[var(--color-foreground)]">
        {value}
      </span>
    </div>
  );
}

export function EvaluationPlanDetail({
  tier,
  rules,
  type,
  programLabel,
  onStart,
  loading,
  className,
}: {
  tier: EvaluationPlanTier;
  rules: EvaluationPlanRules;
  type: string;
  programLabel: string;
  onStart: () => void;
  loading?: boolean;
  className?: string;
}) {
  const isZero = type === "ZERO";
  const isTwoStep = type === "TWO_STEP";

  return (
    <article
      className={cn(
        "glass-card overflow-hidden rounded-2xl border border-[var(--color-border)]",
        className,
      )}
    >
      <div className="border-b border-[var(--color-border)] px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{programLabel}</Badge>
          {tier.mostPopular ? (
            <Badge variant="gold" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Popular
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Program size
            </p>
            <p className="text-4xl font-bold tracking-tight">
              {formatEvaluationSize(tier.evaluationSize)}
            </p>
            <p className="mt-1 text-sm text-muted">
              Trade up to this evaluation balance on MT5
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Program fee
            </p>
            <p className="text-3xl font-bold text-primary">
              {formatCurrency(tier.feeUsdt)}
            </p>
          </div>
        </div>

        <Button
          className="mt-5 w-full py-6 text-base font-semibold"
          onClick={onStart}
          disabled={loading}
        >
          Start Evaluation
        </Button>

        <p className="mt-3 text-center text-xs text-muted">
          Avg first reward{" "}
          <span className="font-semibold text-rank-gold">
            {formatCurrency(tier.avgFirstReward)}
          </span>
        </p>
      </div>

      <div className="bg-primary/[0.04] px-5 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Program rules
        </p>
        <div className="divide-y divide-[var(--color-border)]">
          {!isZero ? (
            <>
              <RuleRow
                label="Profit target"
                hint="Required gain before advancing"
                value={
                  rules.profitTargetPhase1 != null ? (
                    <span>
                      P1 {rules.profitTargetPhase1}%
                      {isTwoStep && rules.profitTargetPhase2 != null
                        ? ` · P2 ${rules.profitTargetPhase2}%`
                        : ""}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <RuleRow label="Master phase" value="—" />
            </>
          ) : (
            <>
              <RuleRow label="Profit target" value="—" />
              <RuleRow
                label="Consistency"
                value={`${rules.consistencyPercent}%`}
              />
            </>
          )}
          <RuleRow
            label="Max loss"
            hint="Total drawdown from starting equity"
            value={`${rules.maxLossPercent}%`}
          />
          <RuleRow
            label="Daily loss"
            hint="Maximum loss in one trading day"
            value={`${rules.dailyLossPercent}%`}
          />
          {rules.minTradingDays != null ? (
            <RuleRow
              label="Min trading days"
              value={`${rules.minTradingDays} days`}
            />
          ) : rules.minProfitableDays != null ? (
            <RuleRow
              label="Min profitable days"
              value={`${rules.minProfitableDays} days`}
            />
          ) : null}
          <RuleRow label="Profit split" value={rules.profitSplitLabel} />
        </div>
      </div>
    </article>
  );
}
