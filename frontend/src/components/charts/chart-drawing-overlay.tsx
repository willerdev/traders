"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ChartDrawing, ChartDrawingPoint } from "@/lib/chart-tools";
import { distanceToSegment } from "@/lib/chart-tools";
import { fmtMt5Price } from "@/components/mt5/mt5-ui";

const DRAWING_COLOR = "#a78bfa";
const ALERT_COLOR = "#fbbf24";
const PENDING_COLOR = "#94a3b8";

export type ChartCoordinateApi = {
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
  coordinateToPrice: (y: number) => number | null;
  coordinateToTime: (x: number) => number | null;
};

type Props = {
  ready: boolean;
  coords: ChartCoordinateApi;
  drawings: ChartDrawing[];
  pendingTrend: ChartDrawingPoint | null;
  previewPoint: ChartDrawingPoint | null;
  alertPrices: number[];
  showDrawings: boolean;
  eraseMode: boolean;
  onEraseDrawing?: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export function ChartDrawingOverlay({
  ready,
  coords,
  drawings,
  pendingTrend,
  previewPoint,
  alertPrices,
  showDrawings,
  eraseMode,
  onEraseDrawing,
  containerRef,
}: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => tick((n) => n + 1));
    ro.observe(el);
    const interval = setInterval(() => tick((n) => n + 1), 250);
    return () => {
      ro.disconnect();
      clearInterval(interval);
    };
  }, [ready, containerRef]);

  if (!ready || !showDrawings) return null;

  const width = containerRef.current?.clientWidth ?? 0;
  const height = containerRef.current?.clientHeight ?? 0;
  if (width < 10 || height < 10) return null;

  function yForPrice(price: number): number | null {
    return coords.priceToCoordinate(price);
  }

  function xForTime(time: number): number | null {
    return coords.timeToCoordinate(time);
  }

  const elements: ReactNode[] = [];

  for (const drawing of drawings) {
    if (drawing.type === "hline") {
      const y = yForPrice(drawing.price);
      if (y == null) continue;
      elements.push(
        <g key={drawing.id} data-drawing-id={drawing.id}>
          <line
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={DRAWING_COLOR}
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
          <text
            x={6}
            y={y - 4}
            fill={DRAWING_COLOR}
            fontSize={10}
            fontWeight={600}
          >
            {fmtMt5Price(drawing.price)}
          </text>
        </g>,
      );
    } else {
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
  }

  for (const price of alertPrices) {
    const y = yForPrice(price);
    if (y == null) continue;
    elements.push(
      <g key={`alert-${price}`}>
        <line
          x1={0}
          y1={y}
          x2={width}
          y2={y}
          stroke={ALERT_COLOR}
          strokeWidth={1.5}
        />
        <text
          x={width - 6}
          y={y - 4}
          fill={ALERT_COLOR}
          fontSize={10}
          fontWeight={600}
          textAnchor="end"
        >
          Alert {fmtMt5Price(price)}
        </text>
      </g>,
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

    for (const drawing of drawings) {
      if (drawing.type === "hline") {
        const y = yForPrice(drawing.price);
        if (y != null && Math.abs(py - y) <= hit) {
          onEraseDrawing(drawing.id);
          return;
        }
      } else {
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
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[8] h-full w-full"
      style={{ pointerEvents: eraseMode ? "auto" : "none" }}
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
