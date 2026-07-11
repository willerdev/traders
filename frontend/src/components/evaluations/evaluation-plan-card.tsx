"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="flex items-start justify-between gap-2 py-2 text-sm">
      <span className="flex items-center gap-1 text-slate-500">
        {label}
        {hint ? (
          <span title={hint} className="cursor-help">
            <Info className="h-3.5 w-3.5 opacity-60" />
          </span>
        ) : (
          <Info className="h-3.5 w-3.5 opacity-40" />
        )}
      </span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

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
  const isTwoStep = type === "TWO_STEP";

  return (
    <article
      className={cn(
        "relative flex min-w-[220px] max-w-[260px] shrink-0 flex-col rounded-2xl border p-5 shadow-sm transition-transform hover:-translate-y-0.5",
        highlighted
          ? "border-[#1e2a4a] bg-[#1e2a4a] text-white shadow-lg"
          : "border-slate-200 bg-white text-slate-900",
      )}
    >
      {highlighted ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1e2a4a]">
          Most Popular
        </span>
      ) : null}

      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider",
              highlighted ? "text-white/70" : "text-slate-400",
            )}
          >
            Evaluation Size
          </p>
          <p className="text-3xl font-bold tracking-tight">
            {formatEvaluationSize(tier.evaluationSize)}
          </p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider",
              highlighted ? "text-white/70" : "text-slate-400",
            )}
          >
            Fee
          </p>
          <p className="text-xl font-bold">{formatCurrency(tier.feeUsdt)}</p>
        </div>
      </div>

      <Button
        className={cn(
          "mb-4 w-full rounded-xl py-5 text-base font-semibold",
          highlighted
            ? "bg-white text-[#1e2a4a] hover:bg-slate-100"
            : "bg-[#1e2a4a] text-white hover:bg-[#162038]",
        )}
        onClick={onStart}
        disabled={loading}
      >
        Start Evaluation
      </Button>

      <div
        className={cn(
          "space-y-0 divide-y text-sm",
          highlighted ? "divide-white/10" : "divide-slate-100",
        )}
      >
        {!isZero ? (
          <>
            <RuleRow
              label="Profit Target"
              hint="Required gain before advancing"
              value={
                <span className="text-right">
                  {rules.profitTargetPhase1 != null ? (
                    <>
                      <span className="block text-xs opacity-70">Phase 1</span>
                      {rules.profitTargetPhase1}%
                    </>
                  ) : (
                    "—"
                  )}
                  {isTwoStep && rules.profitTargetPhase2 != null ? (
                    <>
                      <span className="mt-1 block text-xs opacity-70">Phase 2</span>
                      {rules.profitTargetPhase2}%
                    </>
                  ) : null}
                </span>
              }
            />
            <RuleRow label="Master" value="—" />
          </>
        ) : (
          <>
            <RuleRow label="Profit Target" value="—" />
            <RuleRow
              label="Consistency"
              value={`Master ${rules.consistencyPercent}%`}
            />
          </>
        )}

        <RuleRow
          label="Max Loss"
          hint="Total drawdown limit from starting equity"
          value={`${rules.maxLossPercent}%`}
        />
        <RuleRow
          label="Daily Loss"
          hint="Maximum loss allowed in a single day"
          value={`${rules.dailyLossPercent}%`}
        />

        {rules.minTradingDays != null ? (
          <RuleRow
            label="Min Trading Days"
            value={
              <span>
                <span className="block text-xs opacity-70">Evaluation</span>
                {rules.minTradingDays} days
              </span>
            }
          />
        ) : rules.minProfitableDays != null ? (
          <RuleRow
            label="Min Profitable Days"
            value={`Master ${rules.minProfitableDays} days`}
          />
        ) : null}

        <RuleRow label="Split" value={rules.profitSplitLabel} />
      </div>

      <p
        className={cn(
          "mt-4 text-center text-xs",
          highlighted ? "text-white/60" : "text-slate-400",
        )}
      >
        Traders earn{" "}
        <span className={highlighted ? "text-white" : "font-semibold text-slate-700"}>
          {formatCurrency(tier.avgFirstReward)}
        </span>{" "}
        avg first rewards
      </p>
    </article>
  );
}
