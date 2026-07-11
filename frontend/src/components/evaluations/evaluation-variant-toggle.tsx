"use client";

import { cn } from "@/lib/utils";
import type { EvaluationVariantId } from "@/lib/evaluation-plans";

const OPTIONS: { id: EvaluationVariantId; label: string }[] = [
  { id: "STANDARD", label: "Standard" },
  { id: "FLEX", label: "Flex" },
  { id: "PRO", label: "Pro" },
];

export function EvaluationVariantToggle({
  value,
  onChange,
  className,
}: {
  value: EvaluationVariantId;
  onChange: (value: EvaluationVariantId) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1",
        className,
      )}
      role="tablist"
      aria-label="Program variant"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-lg py-2 text-sm font-semibold transition-all",
            value === option.id
              ? "bg-[var(--color-foreground)] text-[var(--color-background)]"
              : "text-muted hover:text-[var(--color-foreground)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
