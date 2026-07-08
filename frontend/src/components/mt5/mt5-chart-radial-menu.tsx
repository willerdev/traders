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

export const MENU_SIZE = 164;
const HALF = MENU_SIZE / 2;
const RING_WIDTH = 11;
const RING_RADIUS = HALF - RING_WIDTH / 2;

const TF_CENTER = -Math.PI / 2;
const TOOL_CENTER = Math.PI / 2;

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

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Evenly cluster items around center; span grows with count but stays capped. */
function clusteredAngles(
  count: number,
  center: number,
  stepDeg: number,
  maxSpanDeg: number,
): number[] {
  if (count <= 0) return [];
  if (count === 1) return [center];

  const maxSpan = degToRad(maxSpanDeg);
  const step = Math.min(
    degToRad(stepDeg),
    maxSpan / (count - 1),
  );
  const half = ((count - 1) * step) / 2;

  return Array.from({ length: count }, (_, i) => center - half + i * step);
}

function ringPoint(angle: number) {
  return {
    left: HALF + RING_RADIUS * Math.cos(angle),
    top: HALF + RING_RADIUS * Math.sin(angle),
  };
}

const TF_ANGLES = clusteredAngles(
  RADIAL_TIMEFRAMES.length,
  TF_CENTER,
  13,
  118,
);

const TOOL_ANGLES = clusteredAngles(TOOLS.length, TOOL_CENTER, 17, 76);

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
          <svg
            className="absolute inset-0 h-full w-full drop-shadow-[0_0_16px_rgba(0,0,0,0.45)]"
            viewBox={`0 0 ${MENU_SIZE} ${MENU_SIZE}`}
            aria-hidden
          >
            <circle
              cx={HALF}
              cy={HALF}
              r={RING_RADIUS}
              fill="none"
              stroke="#2a2d35"
              strokeWidth={RING_WIDTH}
              strokeOpacity={0.92}
            />
          </svg>

          <button
            type="button"
            onClick={onClose}
            className="absolute z-10 flex h-7 w-7 items-center justify-center text-[var(--mt5-muted)] transition-colors hover:text-[var(--mt5-text)]"
            style={{
              left: HALF,
              top: HALF,
              transform: "translate(-50%, -50%)",
            }}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>

          {RADIAL_TIMEFRAMES.map((tf, i) => {
            const { left, top } = ringPoint(TF_ANGLES[i]);
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
                  "absolute z-10 flex h-5 min-w-[1.5rem] items-center justify-center text-[10px] font-semibold leading-none",
                  tf.mapsTo === activeTimeframe
                    ? "text-[#4a9eff]"
                    : tf.mapsTo
                      ? "text-[var(--mt5-text)]"
                      : "text-[var(--mt5-muted)]/45",
                )}
                style={{
                  left,
                  top,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {tf.label}
              </button>
            );
          })}

          {TOOLS.map((tool, i) => {
            const { left, top } = ringPoint(TOOL_ANGLES[i]);
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  onTool(tool.id);
                  if (tool.id !== "settings") onClose();
                }}
                className="absolute z-10 flex h-6 w-6 items-center justify-center text-[var(--mt5-text)]"
                style={{
                  left,
                  top,
                  transform: "translate(-50%, -50%)",
                }}
                aria-label={tool.label}
                title={tool.label}
              >
                <Icon className="h-[15px] w-[15px]" strokeWidth={1.75} />
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
