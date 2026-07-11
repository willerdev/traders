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
}: {
  value: EvaluationVariantId;
  onChange: (value: EvaluationVariantId) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-slate-100 p-1">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            value === option.id
              ? "bg-white text-[#1e2a4a] shadow-sm"
              : "text-slate-500 hover:text-slate-800",
          )}
        >
          {option.label}
          {option.id === "FLEX" && value === option.id ? (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
          ) : null}
        </button>
      ))}
    </div>
  );
}
