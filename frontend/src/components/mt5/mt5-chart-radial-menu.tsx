"use client";

import {
  CHART_TIMEFRAMES,
  type ChartTimeframe,
} from "@/components/charts/chart-types";
import { cn } from "@/lib/utils";
import { GripHorizontal, LayoutGrid, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export const MENU_WIDTH = 280;
export const MENU_HEIGHT = 108;

const TOOLS = [
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "layout", label: "Fit chart", icon: LayoutGrid },
] as const;

export type RadialToolId = (typeof TOOLS)[number]["id"];

type Props = {
  open: boolean;
  anchor: { x: number; y: number } | null;
  bounds: { width: number; height: number };
  activeTimeframe: ChartTimeframe;
  onClose: () => void;
  onTimeframe: (tf: ChartTimeframe) => void;
  onTool: (tool: RadialToolId) => void;
};

export function Mt5ChartRadialMenu({
  open,
  anchor,
  bounds,
  activeTimeframe,
  onClose,
  onTimeframe,
  onTool,
}: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    if (open && anchor) {
      setPos(clampMenuPosition(anchor.x, anchor.y, bounds));
    } else if (!open) {
      setPos(null);
    }
  }, [open, anchor, bounds.width, bounds.height]);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (!pos) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y,
      };
    },
    [pos],
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      setPos(
        clampMenuPosition(drag.originX + dx, drag.originY + dy, bounds),
      );
    },
    [bounds],
  );

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
  }, []);

  if (!open || !pos) return null;

  return (
    <div
      className="absolute inset-0 z-[20] bg-black/20"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="pointer-events-auto absolute rounded-xl border border-[var(--mt5-divider)] bg-[var(--mt5-surface)]/98 shadow-2xl backdrop-blur-md"
        style={{
          left: pos.x,
          top: pos.y,
          width: `min(${MENU_WIDTH}px, calc(100% - 1rem))`,
          transform: "translate(-50%, 0)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Chart quick menu"
      >
        <div
          className="flex cursor-grab items-center justify-between gap-2 border-b border-[var(--mt5-divider)] px-3 py-2 active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="flex min-w-0 items-center gap-1.5 text-[var(--mt5-muted)]">
            <GripHorizontal className="h-4 w-4 shrink-0" />
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide">
              Chart menu
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)] hover:text-[var(--mt5-text)]"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-2 py-2">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
            Timeframe
          </p>
          <div className="flex flex-wrap gap-1">
            {CHART_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => {
                  onTimeframe(tf);
                  onClose();
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors",
                  tf === activeTimeframe
                    ? "bg-[#4a9eff] text-white"
                    : "bg-[var(--mt5-row-hover)] text-[var(--mt5-text)] hover:bg-[#4a9eff]/20",
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--mt5-divider)] px-2 py-2">
          <div className="grid grid-cols-2 gap-1">
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
                  className="flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-medium text-[var(--mt5-text)] transition-colors hover:bg-[var(--mt5-row-hover)]"
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>{tool.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function clampMenuPosition(
  x: number,
  y: number,
  bounds: { width: number; height: number },
): { x: number; y: number } {
  const halfW = Math.min(MENU_WIDTH / 2, bounds.width / 2 - 8);
  const clampedX = Math.max(halfW + 8, Math.min(x, bounds.width - halfW - 8));
  const clampedY = Math.max(8, Math.min(y, bounds.height - MENU_HEIGHT - 8));
  return { x: clampedX, y: clampedY };
}

export function clampRadialAnchor(
  x: number,
  y: number,
  bounds: { width: number; height: number },
): { x: number; y: number } {
  const belowY = y + 16;
  const aboveY = y - MENU_HEIGHT - 16;
  const fitsBelow = belowY + MENU_HEIGHT <= bounds.height - 8;
  const anchorY = fitsBelow ? belowY : Math.max(8, aboveY);
  return clampMenuPosition(x, anchorY, bounds);
}

export function isSupportedRadialTimeframe(id: string): ChartTimeframe | null {
  return CHART_TIMEFRAMES.includes(id as ChartTimeframe)
    ? (id as ChartTimeframe)
    : null;
}

/** @deprecated use CHART_TIMEFRAMES — kept for imports */
export const RADIAL_TIMEFRAMES = CHART_TIMEFRAMES.map((tf) => ({
  id: tf,
  label: tf,
  mapsTo: tf,
  supported: true,
}));
