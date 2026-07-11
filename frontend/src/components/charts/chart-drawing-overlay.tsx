"use client";

import type { ReactNode } from "react";
import type { ChartDrawing, ChartDrawingPoint } from "@/lib/chart-tools";
import { distanceToSegment } from "@/lib/chart-tools";

export type ChartCoordinateApi = {
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
  coordinateToPrice: (y: number) => number | null;
  coordinateToTime: (x: number) => number | null;
};

type Props = {
  ready: boolean;
  layoutVersion: number;
  coords: ChartCoordinateApi;
  trendlines: Extract<ChartDrawing, { type: "trendline" }>[];
  pendingTrend: ChartDrawingPoint | null;
  previewPoint: ChartDrawingPoint | null;
  showDrawings: boolean;
  eraseMode: boolean;
  onEraseDrawing?: (id: string) => void;
  width: number;
  height: number;
};

const DRAWING_COLOR = "#a78bfa";
const PENDING_COLOR = "#94a3b8";

/** SVG overlay for trendlines only — hlines/alerts use native chart price lines. */
export function ChartDrawingOverlay({
  ready,
  layoutVersion,
  coords,
  trendlines,
  pendingTrend,
  previewPoint,
  showDrawings,
  eraseMode,
  onEraseDrawing,
  width,
  height,
}: Props) {
  if (!ready || !showDrawings || width < 10 || height < 10) return null;

  void layoutVersion;

  function yForPrice(price: number): number | null {
    return coords.priceToCoordinate(price);
  }

  function xForTime(time: number): number | null {
    return coords.timeToCoordinate(time);
  }

  const elements: ReactNode[] = [];

  for (const drawing of trendlines) {
    const x1 = xForTime(drawing.p1.time);
    const y1 = yForPrice(drawing.p1.price);
    const x2 = xForTime(drawing.p2.time);
    const y2 = yForPrice(drawing.p2.price);
    if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
    elements.push(
      <line
        key={drawing.id}
        data-drawing-id={drawing.id}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={DRAWING_COLOR}
        strokeWidth={2}
      />,
    );
  }

  if (pendingTrend && previewPoint) {
    const x1 = xForTime(pendingTrend.time);
    const y1 = yForPrice(pendingTrend.price);
    const x2 = xForTime(previewPoint.time);
    const y2 = yForPrice(previewPoint.price);
    if (x1 != null && y1 != null && x2 != null && y2 != null) {
      elements.push(
        <line
          key="pending-trend"
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={PENDING_COLOR}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />,
      );
    }
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!eraseMode || !onEraseDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const hit = 12;

    for (const drawing of trendlines) {
      const x1 = xForTime(drawing.p1.time);
      const y1 = yForPrice(drawing.p1.price);
      const x2 = xForTime(drawing.p2.time);
      const y2 = yForPrice(drawing.p2.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      if (distanceToSegment(px, py, x1, y1, x2, y2) <= hit) {
        onEraseDrawing(drawing.id);
        return;
      }
    }
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[8] h-full w-full"
      style={{ pointerEvents: eraseMode ? "auto" : "none" }}
      width={width}
      height={height}
      onClick={handleClick}
      aria-hidden
    >
      {elements}
    </svg>
  );
}

export function resolveChartPointFromClient(
  clientX: number,
  clientY: number,
  container: HTMLElement,
  coords: ChartCoordinateApi,
): ChartDrawingPoint | null {
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const price = coords.coordinateToPrice(y);
  const time = coords.coordinateToTime(x);
  if (price == null || time == null || !Number.isFinite(price)) return null;
  return { time, price };
}

/** Hit-test drawings/alerts by price when erasing (native price lines). */
export function findDrawingEraseTarget(
  point: ChartDrawingPoint,
  drawings: ChartDrawing[],
  alertPrices: { id: string; price: number }[],
  priceThresholdRatio = 0.002,
): { type: "drawing" | "alert"; id: string } | null {
  let best: { type: "drawing" | "alert"; id: string; dist: number } | null =
    null;
  const threshold = Math.max(point.price * priceThresholdRatio, 0.5);

  for (const d of drawings) {
    if (d.type !== "hline") continue;
    const dist = Math.abs(d.price - point.price);
    if (dist <= threshold && (!best || dist < best.dist)) {
      best = { type: "drawing", id: d.id, dist };
    }
  }
  for (const a of alertPrices) {
    const dist = Math.abs(a.price - point.price);
    if (dist <= threshold && (!best || dist < best.dist)) {
      best = { type: "alert", id: a.id, dist };
    }
  }
  return best ? { type: best.type, id: best.id } : null;
}
