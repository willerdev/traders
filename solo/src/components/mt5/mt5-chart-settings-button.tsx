"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Mt5ChartDisplaySettings } from "@/lib/mt5-chart-display-settings";

type ToggleKey = keyof Mt5ChartDisplaySettings;

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  {
    key: "showOrders",
    label: "Open orders",
    hint: "Running positions — entry lines & markers",
  },
  {
    key: "showLimits",
    label: "Limits & setups",
    hint: "Pending limits and open setup zones",
  },
  {
    key: "showSlTp",
    label: "Stop loss & take profit",
    hint: "SL/TP lines (drag to adjust when shown)",
  },
  {
    key: "showDrawings",
    label: "Drawings & alerts",
    hint: "Trendlines, horizontal lines, and alert levels",
  },
  {
    key: "showWatermark",
    label: "Name on chart",
    hint: "Your display name in the background",
  },
  {
    key: "showAssistant",
    label: "AI assistant",
    hint: "TradePro floating assistant button",
  },
];

type Props = {
  settings: Mt5ChartDisplaySettings;
  onChange: <K extends ToggleKey>(
    key: K,
    value: Mt5ChartDisplaySettings[K],
  ) => void;
  className?: string;
  /** toolbar = inline in header; chart = removed (use radial) */
  placement?: "toolbar" | "chart";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Mt5ChartSettingsButton({
  settings,
  onChange,
  className,
  placement = "toolbar",
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={cn(
        placement === "toolbar" ? "relative shrink-0" : "absolute right-2 top-2 z-[12]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border border-[var(--mt5-divider)] bg-[var(--mt5-surface)]/95 text-[var(--mt5-muted)] shadow-md backdrop-blur-sm transition-colors hover:bg-[var(--mt5-row-hover)] hover:text-[var(--mt5-text)]",
          open && "border-primary/40 text-primary",
        )}
        aria-label="Chart display settings"
        aria-expanded={open}
      >
        <Settings2 className="h-4 w-4" strokeWidth={2} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-[min(17rem,calc(100vw-2rem))] rounded-xl border border-[var(--mt5-divider)] bg-[var(--mt5-surface)] p-3 shadow-xl",
            placement === "toolbar"
              ? "right-0 top-11"
              : "right-0 top-11",
          )}
          role="dialog"
          aria-label="Chart display settings"
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
            Chart display
          </p>
          <ul className="space-y-2">
            {TOGGLES.map(({ key, label, hint }) => {
              const on = settings[key];
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 hover:bg-[var(--mt5-row-hover)]">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => onChange(key, e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--mt5-divider)] accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-[var(--mt5-text)]">
                        {label}
                      </span>
                      <span className="block text-[10px] leading-snug text-[var(--mt5-muted)]">
                        {hint}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
