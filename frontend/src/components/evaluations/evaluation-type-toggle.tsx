"use client";

import { cn } from "@/lib/utils";
import type { EvaluationTypeId } from "@/lib/evaluation-plans";

const OPTIONS: { id: EvaluationTypeId; label: string }[] = [
  { id: "ZERO", label: "Zero" },
  { id: "ONE_STEP", label: "1 Step" },
  { id: "TWO_STEP", label: "2 Step" },
];

export function EvaluationTypeToggle({
  value,
  onChange,
}: {
  value: EvaluationTypeId;
  onChange: (value: EvaluationTypeId) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-slate-200 p-1">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-full px-5 py-2 text-sm font-medium transition-colors",
            value === option.id
              ? "bg-[#1e2a4a] text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
