"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChartPriceLine } from "@/components/charts/chart-types";
import { fmtMt5Price } from "@/components/mt5/mt5-ui";

const HIT_THRESHOLD_PX = 14;

type DragState = {
  lineId: string;
  startPrice: number;
};

type Options = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  ready: boolean;
  lines: ChartPriceLine[];
  enabled?: boolean;
  priceToCoordinate: (price: number) => number | null;
  coordinateToPrice: (y: number) => number | null;
  setScrollEnabled: (enabled: boolean) => void;
  onLinePriceChange: (lineId: string, price: number) => void;
  onDragEnd: (line: ChartPriceLine, newPrice: number) => Promise<void>;
};

function formatLineTitle(line: ChartPriceLine, price: number): string {
  if (line.kind === "sl") return `SL · ${fmtMt5Price(price)}`;
  if (line.kind === "tp") return `TP · ${fmtMt5Price(price)}`;
  return line.title ?? fmtMt5Price(price);
}

export function useDraggableOrderLines({
  containerRef,
  ready,
  lines,
  enabled = true,
  priceToCoordinate,
  coordinateToPrice,
  setScrollEnabled,
  onLinePriceChange,
  onDragEnd,
}: Options) {
  const linesRef = useRef(lines);
  const dragRef = useRef<DragState | null>(null);
  const [hoverLineId, setHoverLineId] = useState<string | null>(null);
  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [dragLabel, setDragLabel] = useState<{
    price: number;
    y: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  linesRef.current = lines;
  savingRef.current = saving;

  const findLineAtY = useCallback(
    (clientY: number): ChartPriceLine | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const localY = clientY - rect.top;

      let best: ChartPriceLine | null = null;
      let bestDist = HIT_THRESHOLD_PX;

      for (const line of linesRef.current) {
        if (!line.draggable || (line.kind !== "sl" && line.kind !== "tp")) {
          continue;
        }
        const y = priceToCoordinate(line.price);
        if (y == null) continue;
        const dist = Math.abs(y - localY);
        if (dist <= bestDist) {
          bestDist = dist;
          best = line;
        }
      }
      return best;
    },
    [containerRef, priceToCoordinate],
  );

  const finishDrag = useCallback(
    async (line: ChartPriceLine, newPrice: number) => {
      setSaving(true);
      try {
        await onDragEnd(line, newPrice);
      } finally {
        setSaving(false);
        setDragLabel(null);
        setDraggingLineId(null);
        dragRef.current = null;
        setScrollEnabled(true);
      }
    },
    [onDragEnd, setScrollEnabled],
  );

  useEffect(() => {
    if (!containerRef.current || !ready || !enabled) return;
    const target: HTMLDivElement = containerRef.current;

    function onPointerDown(e: PointerEvent) {
      if (savingRef.current) return;
      const line = findLineAtY(e.clientY);
      if (!line) return;

      e.preventDefault();
      e.stopPropagation();
      target.setPointerCapture(e.pointerId);
      dragRef.current = { lineId: line.id, startPrice: line.price };
      setDraggingLineId(line.id);
      setScrollEnabled(false);
    }

    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (drag) {
        const price = coordinateToPrice(e.clientY - target.getBoundingClientRect().top);
        if (price == null || !Number.isFinite(price)) return;
        onLinePriceChange(drag.lineId, price);
        const line = linesRef.current.find((l) => l.id === drag.lineId);
        if (line) {
          const y = priceToCoordinate(price);
          setDragLabel(
            y != null ? { price, y } : { price, y: e.clientY - target.getBoundingClientRect().top },
          );
        }
        return;
      }

      const hover = findLineAtY(e.clientY);
      setHoverLineId(hover?.id ?? null);
    }

    function onPointerUp(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const line = linesRef.current.find((l) => l.id === drag.lineId);
      if (!line) {
        dragRef.current = null;
        setDraggingLineId(null);
        setDragLabel(null);
        setScrollEnabled(true);
        return;
      }

      const localY = e.clientY - target.getBoundingClientRect().top;
      const newPrice = coordinateToPrice(localY);
      if (newPrice == null || !Number.isFinite(newPrice)) {
        onLinePriceChange(drag.lineId, drag.startPrice);
        dragRef.current = null;
        setDraggingLineId(null);
        setDragLabel(null);
        setScrollEnabled(true);
        return;
      }

      if (Math.abs(newPrice - drag.startPrice) < 1e-9) {
        dragRef.current = null;
        setDraggingLineId(null);
        setDragLabel(null);
        setScrollEnabled(true);
        return;
      }

      void finishDrag({ ...line, price: newPrice }, newPrice);
    }

    function onPointerCancel(e: PointerEvent) {
      if (!dragRef.current) return;
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const original = dragRef.current.startPrice;
      onLinePriceChange(dragRef.current.lineId, original);
      dragRef.current = null;
      setDraggingLineId(null);
      setDragLabel(null);
      setScrollEnabled(true);
    }

    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerCancel);

    return () => {
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [
    containerRef,
    ready,
    enabled,
    findLineAtY,
    coordinateToPrice,
    priceToCoordinate,
    onLinePriceChange,
    setScrollEnabled,
    finishDrag,
  ]);

  const cursor =
    draggingLineId || hoverLineId ? "ns-resize" : undefined;

  return {
    cursor,
    dragLabel,
    draggingLineId,
    saving,
    formatLineTitle,
  };
}
