"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type EvaluationEnrollment } from "@/lib/api";
import { formatEvaluationSize } from "@/lib/evaluation-plans";
import { formatCurrency, cn } from "@/lib/utils";

type Props = {
  selectedId?: string | null;
  onSelected?: (enrollmentId: string) => void;
  className?: string;
};

function typeLabel(type: string) {
  switch (type) {
    case "ZERO":
      return "Zero";
    case "ONE_STEP":
      return "1 Step";
    case "TWO_STEP":
      return "2 Step";
    default:
      return type.replace(/_/g, " ");
  }
}

function statusTone(status: string) {
  switch (status) {
    case "ACTIVE":
      return "text-[#4a9eff] border-[#4a9eff]/40 bg-[#4a9eff]/10";
    case "PASSED":
      return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
    case "BREACHED":
      return "text-[#ff5252] border-[#ff5252]/40 bg-[#ff5252]/10";
    default:
      return "text-[var(--mt5-muted)] border-[var(--mt5-divider)] bg-[var(--mt5-row-hover)]";
  }
}

function EvaluationAccountChip({
  item,
  selected,
  selecting,
  onSelect,
}: {
  item: EvaluationEnrollment;
  selected: boolean;
  selecting: boolean;
  onSelect: () => void;
}) {
  const equity = item.currentEquity ?? item.startEquity;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={selecting}
      className={cn(
        "flex min-w-[9.5rem] shrink-0 flex-col rounded-lg border px-3 py-2 text-left transition-colors",
        selected
          ? "border-primary bg-primary/15 ring-1 ring-primary/40"
          : "border-[var(--mt5-divider)] bg-[var(--mt5-surface)] hover:border-primary/40 hover:bg-[var(--mt5-row-hover)]",
        selecting && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-white">
          {formatEvaluationSize(item.evaluationSize)}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide border",
            statusTone(item.status),
          )}
        >
          {item.status.toLowerCase()}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--mt5-muted)]">
        {typeLabel(item.type)} · {item.variant.toLowerCase()}
      </p>
      {equity != null && (
        <p className="mt-1 text-[11px] font-medium tabular-nums text-white/90">
          {formatCurrency(equity)}
        </p>
      )}
    </button>
  );
}

export function Mt5EvaluationAccountPicker({
  selectedId,
  onSelected,
  className,
}: Props) {
  const [items, setItems] = useState<EvaluationEnrollment[]>([]);
  const [activeId, setActiveId] = useState<string | null>(selectedId ?? null);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const onSelectedRef = useRef(onSelected);

  useEffect(() => {
    onSelectedRef.current = onSelected;
  }, [onSelected]);

  const load = useCallback(async () => {
    try {
      const res = await api.evaluations.listMine();
      setItems(res.items);

      const preferred =
        res.selectedEnrollmentId ??
        res.items.find((item) => item.status === "ACTIVE")?.id ??
        res.items[0]?.id ??
        null;

      setActiveId(preferred);

      if (
        preferred &&
        !res.selectedEnrollmentId &&
        res.items.some((item) => item.id === preferred)
      ) {
        try {
          await api.evaluations.select(preferred);
          onSelectedRef.current?.(preferred);
        } catch {
          /* backend fallback still resolves first active account */
        }
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId != null) setActiveId(selectedId);
  }, [selectedId]);

  async function handleSelect(enrollmentId: string) {
    if (enrollmentId === activeId || selectingId) return;
    setSelectingId(enrollmentId);
    try {
      await api.evaluations.select(enrollmentId);
      setActiveId(enrollmentId);
      onSelected?.(enrollmentId);
    } catch {
      /* keep previous selection */
    } finally {
      setSelectingId(null);
    }
  }

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-2 text-xs text-[var(--mt5-muted)]",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading evaluation accounts…
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "shrink-0 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-2",
        className,
      )}
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
        Your evaluations
      </p>
      <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <EvaluationAccountChip
            key={item.id}
            item={item}
            selected={item.id === activeId}
            selecting={selectingId === item.id}
            onSelect={() => void handleSelect(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
