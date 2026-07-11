"use client";

import { cn } from "@/lib/utils";
import type { EvaluationTypeId } from "@/lib/evaluation-plans";

const OPTIONS: { id: EvaluationTypeId; label: string; hint: string }[] = [
  { id: "ZERO", label: "Zero", hint: "No profit target" },
  { id: "ONE_STEP", label: "1 Step", hint: "Single phase" },
  { id: "TWO_STEP", label: "2 Step", hint: "Two phases" },
];

export function EvaluationTypeToggle({
  value,
  onChange,
  className,
}: {
  value: EvaluationTypeId;
  onChange: (value: EvaluationTypeId) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1",
        className,
      )}
      role="tablist"
      aria-label="Program type"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-lg px-2 py-2.5 text-center transition-all sm:px-4 sm:py-3",
            value === option.id
              ? "bg-primary text-white shadow-sm"
              : "text-muted hover:text-[var(--color-foreground)]",
          )}
        >
          <span className="block text-sm font-semibold">{option.label}</span>
          <span
            className={cn(
              "mt-0.5 hidden text-[10px] sm:block",
              value === option.id ? "text-white/75" : "text-muted",
            )}
          >
            {option.hint}
          </span>
        </button>
      ))}
    </div>
  );
}
