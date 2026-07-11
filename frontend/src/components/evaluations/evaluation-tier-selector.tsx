"use client";

import { cn } from "@/lib/utils";
import { formatTierPill, type EvaluationPlanTier } from "@/lib/evaluation-plans";

export function EvaluationTierSelector({
  tiers,
  value,
  onChange,
}: {
  tiers: EvaluationPlanTier[];
  value: string;
  onChange: (tierId: string) => void;
}) {
  return (
    <div className="relative -mx-1">
      <div className="flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tiers.map((tier) => {
          const active = tier.id === value;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => onChange(tier.id)}
              className={cn(
                "relative shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
                active
                  ? "bg-primary text-white shadow-md shadow-primary/25"
                  : "border border-[var(--color-border)] bg-[var(--color-surface)] text-muted hover:border-primary/40 hover:text-[var(--color-foreground)]",
              )}
            >
              {formatTierPill(tier.evaluationSize)}
              {tier.mostPopular && !active ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rank-gold" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
