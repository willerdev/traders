"use client";

import { useState } from "react";
import {
  Bell,
  Eraser,
  Minus,
  MousePointer2,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChartPriceAlert, ChartToolMode } from "@/lib/chart-tools";
import { alertDirectionLabel } from "@/lib/chart-tools";
import { fmtMt5Price } from "@/components/mt5/mt5-ui";

const TOOLS: {
  id: ChartToolMode;
  label: string;
  icon: typeof MousePointer2;
  hint: string;
}[] = [
  { id: "select", label: "Select", icon: MousePointer2, hint: "Tap chart for menu" },
  { id: "hline", label: "H-line", icon: Minus, hint: "Click chart to place" },
  {
    id: "trendline",
    label: "Trend",
    icon: TrendingUp,
    hint: "Two clicks for a line",
  },
  { id: "alert", label: "Alert", icon: Bell, hint: "Click price level" },
  { id: "erase", label: "Erase", icon: Eraser, hint: "Click a drawing" },
];

type Props = {
  activeTool: ChartToolMode;
  onToolChange: (tool: ChartToolMode) => void;
  alerts: ChartPriceAlert[];
  pendingTrend: boolean;
  onRemoveAlert: (id: string) => void;
  onClearTriggered: () => void;
  className?: string;
};

export function ChartToolsToolbar({
  activeTool,
  onToolChange,
  alerts,
  pendingTrend,
  onRemoveAlert,
  onClearTriggered,
  className,
}: Props) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const activeAlerts = alerts.filter((a) => !a.triggered);
  const triggeredCount = alerts.filter((a) => a.triggered).length;

  return (
    <div className={cn("relative flex shrink-0 items-center gap-1", className)}>
      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--mt5-divider)] bg-[var(--mt5-surface)] p-0.5">
        {TOOLS.map(({ id, label, icon: Icon, hint }) => (
          <button
            key={id}
            type="button"
            title={hint}
            onClick={() => onToolChange(id)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              activeTool === id
                ? "bg-primary text-white"
                : "text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)] hover:text-[var(--mt5-text)]",
            )}
            aria-label={label}
            aria-pressed={activeTool === id}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ))}
      </div>

      {pendingTrend && (
        <span className="hidden text-[10px] text-[var(--mt5-muted)] sm:inline">
          2nd point…
        </span>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setAlertsOpen((o) => !o)}
          className={cn(
            "flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition-colors",
            activeAlerts.length > 0
              ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
              : "border-[var(--mt5-divider)] text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)]",
          )}
          aria-expanded={alertsOpen}
        >
          <Bell className="h-3.5 w-3.5" />
          {activeAlerts.length > 0 ? activeAlerts.length : null}
        </button>

        {alertsOpen && (
          <div className="absolute right-0 top-9 z-50 w-[min(16rem,calc(100vw-2rem))] rounded-xl border border-[var(--mt5-divider)] bg-[var(--mt5-surface)] p-2 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
                Price alerts
              </p>
              <button
                type="button"
                onClick={() => setAlertsOpen(false)}
                className="rounded p-0.5 text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)]"
                aria-label="Close alerts"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {alerts.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-[var(--mt5-muted)]">
                Use the bell tool and click a price on the chart.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px]",
                      alert.triggered
                        ? "bg-[var(--mt5-row-hover)] text-[var(--mt5-muted)] line-through"
                        : "text-[var(--mt5-text)]",
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {fmtMt5Price(alert.price)} ·{" "}
                      {alertDirectionLabel(alert.direction)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveAlert(alert.id)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#ff5252] hover:bg-[#ff5252]/10"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {triggeredCount > 0 && (
              <button
                type="button"
                onClick={onClearTriggered}
                className="mt-2 w-full rounded-md border border-[var(--mt5-divider)] px-2 py-1.5 text-[10px] font-semibold text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)]"
              >
                Clear triggered ({triggeredCount})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChartAlertToastStack({
  toasts,
  onDismiss,
}: {
  toasts: { id: string; symbol: string; message: string }[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-2 right-2 top-12 z-[25] flex flex-col gap-1.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[11px] text-amber-100 shadow-lg backdrop-blur-sm"
          role="status"
        >
          <span>
            <strong className="font-semibold">{toast.symbol}</strong> ·{" "}
            {toast.message}
          </span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 rounded p-0.5 hover:bg-amber-500/20"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
