"use client";

import {
  CHART_TIMEFRAMES,
  type ChartTimeframe,
} from "@/components/charts/chart-types";
import { cn } from "@/lib/utils";
import {
  Crosshair,
  LayoutGrid,
  Settings2,
  Shapes,
  TrendingUp,
  X,
} from "lucide-react";

export const MENU_WIDTH = 300;
export const MENU_HEIGHT = 132;

/** MT5-style labels (unsupported map to nearest backend TF). */
export const RADIAL_TIMEFRAMES: {
  id: string;
  label: string;
  mapsTo?: ChartTimeframe;
  supported: boolean;
}[] = [
  { id: "M1", label: "M1", mapsTo: "M1", supported: true },
  { id: "M5", label: "M5", mapsTo: "M5", supported: true },
  { id: "M15", label: "M15", mapsTo: "M15", supported: true },
  { id: "M30", label: "M30", mapsTo: "M15", supported: false },
  { id: "H1", label: "H1", mapsTo: "H1", supported: true },
  { id: "H4", label: "H4", mapsTo: "H1", supported: false },
  { id: "D1", label: "D1", mapsTo: "D1", supported: true },
  { id: "W1", label: "W1", mapsTo: "D1", supported: false },
  { id: "MN", label: "MN", mapsTo: "D1", supported: false },
];

const TOOLS = [
  { id: "crosshair", label: "Crosshair", icon: Crosshair },
  { id: "indicators", label: "Indicators", icon: TrendingUp },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "objects", label: "Objects", icon: Shapes },
  { id: "layout", label: "Fit", icon: LayoutGrid },
] as const;

export type RadialToolId = (typeof TOOLS)[number]["id"];

type Props = {
  open: boolean;
  anchor: { x: number; y: number } | null;
  activeTimeframe: ChartTimeframe;
  onClose: () => void;
  onTimeframe: (tf: ChartTimeframe) => void;
  onTool: (tool: RadialToolId) => void;
};

export function Mt5ChartRadialMenu({
  open,
  anchor,
  activeTimeframe,
  onClose,
  onTimeframe,
  onTool,
}: Props) {
  if (!open || !anchor) return null;

  return (
    <div
      className="absolute inset-0 z-[20] bg-black/25"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="pointer-events-auto absolute max-w-[calc(100%-1rem)] rounded-xl border border-[var(--mt5-divider)] bg-[var(--mt5-surface)]/98 shadow-2xl backdrop-blur-md"
        style={{
          left: anchor.x,
          top: anchor.y,
          width: `min(${MENU_WIDTH}px, calc(100% - 1rem))`,
          transform: "translate(-50%, 0)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Chart quick menu"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--mt5-divider)] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
            Timeframes
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)] hover:text-[var(--mt5-text)]"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {RADIAL_TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              type="button"
              disabled={!tf.mapsTo}
              onClick={() => {
                if (tf.mapsTo) onTimeframe(tf.mapsTo);
                onClose();
              }}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold tabular-nums transition-colors",
                tf.mapsTo === activeTimeframe
                  ? "bg-[#4a9eff] text-white"
                  : tf.mapsTo
                    ? "bg-[var(--mt5-row-hover)] text-[var(--mt5-text)] hover:bg-[#4a9eff]/20"
                    : "cursor-not-allowed text-[var(--mt5-muted)]/40",
              )}
              title={tf.supported ? tf.label : `${tf.label} (uses ${tf.mapsTo})`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="border-t border-[var(--mt5-divider)] px-2 py-2">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
            Tools
          </p>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    onTool(tool.id);
                    if (tool.id !== "settings") onClose();
                  }}
                  className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium text-[var(--mt5-text)] transition-colors hover:bg-[var(--mt5-row-hover)]"
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="leading-tight">{tool.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function clampRadialAnchor(
  x: number,
  y: number,
  bounds: { width: number; height: number },
): { x: number; y: number } {
  const halfW = Math.min(MENU_WIDTH / 2, bounds.width / 2 - 8);
  const clampedX = Math.max(halfW + 8, Math.min(x, bounds.width - halfW - 8));

  const belowY = y + 16;
  const aboveY = y - MENU_HEIGHT - 16;
  const fitsBelow = belowY + MENU_HEIGHT <= bounds.height - 8;
  const clampedY = fitsBelow
    ? belowY
    : Math.max(8, Math.min(aboveY, bounds.height - MENU_HEIGHT - 8));

  return { x: clampedX, y: clampedY };
}

export function isSupportedRadialTimeframe(id: string): ChartTimeframe | null {
  const row = RADIAL_TIMEFRAMES.find((t) => t.id === id);
  if (!row?.mapsTo) return null;
  return CHART_TIMEFRAMES.includes(row.mapsTo) ? row.mapsTo : row.mapsTo;
}
