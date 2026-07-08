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

const MENU_SIZE = 220;
const HALF = MENU_SIZE / 2;

/** MT5-style ring labels (unsupported map to nearest backend TF). */
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
  { id: "layout", label: "Layout", icon: LayoutGrid },
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

function arcPosition(
  index: number,
  total: number,
  radius: number,
  startRad: number,
  endRad: number,
) {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const angle = startRad + (endRad - startRad) * t;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

export function Mt5ChartRadialMenu({
  open,
  anchor,
  activeTimeframe,
  onClose,
  onTimeframe,
  onTool,
}: Props) {
  if (!open || !anchor) return null;

  const tfRadius = 88;
  const toolRadius = 72;

  return (
    <div
      className="absolute inset-0 z-[20] bg-black/20"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="pointer-events-none absolute"
        style={{
          left: anchor.x,
          top: anchor.y,
          width: MENU_SIZE,
          height: MENU_SIZE,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          className="pointer-events-auto relative h-full w-full"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Chart quick menu"
        >
          {/* Donut ring — transparent center shows chart underneath */}
          <div className="absolute inset-0 rounded-full border-[14px] border-[#2a2d35]/92 bg-transparent shadow-[0_0_24px_rgba(0,0,0,0.45)]" />

          <button
            type="button"
            onClick={onClose}
            className="absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[var(--mt5-muted)] transition-colors hover:text-[var(--mt5-text)]"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>

          {RADIAL_TIMEFRAMES.map((tf, i) => {
            const { x, y } = arcPosition(
              i,
              RADIAL_TIMEFRAMES.length,
              tfRadius,
              -Math.PI * 0.92,
              -Math.PI * 0.08,
            );
            return (
              <button
                key={tf.id}
                type="button"
                disabled={!tf.mapsTo}
                onClick={() => {
                  if (tf.mapsTo) onTimeframe(tf.mapsTo);
                  onClose();
                }}
                className={cn(
                  "absolute left-1/2 top-1/2 flex h-8 min-w-[2rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md text-[11px] font-semibold",
                  tf.mapsTo === activeTimeframe
                    ? "text-[#4a9eff]"
                    : tf.mapsTo
                      ? "text-[var(--mt5-text)] hover:bg-white/10"
                      : "text-[var(--mt5-muted)]/40",
                )}
                style={{
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                }}
              >
                {tf.label}
              </button>
            );
          })}

          {TOOLS.map((tool, i) => {
            const { x, y } = arcPosition(
              i,
              TOOLS.length,
              toolRadius,
              Math.PI * 0.08,
              Math.PI * 0.92,
            );
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  onTool(tool.id);
                  if (tool.id !== "settings") onClose();
                }}
                className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--mt5-text)] hover:bg-white/10"
                style={{
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                }}
                aria-label={tool.label}
                title={tool.label}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            );
          })}
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
  return {
    x: Math.max(HALF, Math.min(x, bounds.width - HALF)),
    y: Math.max(HALF, Math.min(y, bounds.height - HALF)),
  };
}

export function isSupportedRadialTimeframe(id: string): ChartTimeframe | null {
  const row = RADIAL_TIMEFRAMES.find((t) => t.id === id);
  if (!row?.mapsTo) return null;
  return CHART_TIMEFRAMES.includes(row.mapsTo) ? row.mapsTo : row.mapsTo;
}
