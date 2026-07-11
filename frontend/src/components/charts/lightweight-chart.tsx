"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useThemeStore } from "@/stores/theme";
import {
  loadChartData,
  resolveSeedPrice,
  subscribeRealtimeUpdates,
  type RealtimeQuote,
} from "@/components/charts/chart-data.service";
import { readChartBarCache } from "@/lib/chart-bar-cache";
import type {
  ChartMarker,
  ChartPriceLine,
  ChartSymbol,
  ChartTimeframe,
  OHLCBar,
} from "@/components/charts/chart-types";
import {
  useLightweightChart,
  type SetChartDataOptions,
} from "@/components/charts/use-lightweight-chart";
import { useDraggableOrderLines } from "@/components/charts/use-draggable-order-lines";
import { validateStopDrag } from "@/components/charts/validate-stop-levels";
import {
  ChartDrawingOverlay,
  findDrawingEraseTarget,
  resolveChartPointFromClient,
  type ChartCoordinateApi,
} from "@/components/charts/chart-drawing-overlay";
import type { ChartDrawing, ChartDrawingPoint, ChartToolMode } from "@/lib/chart-tools";
import { fmtMt5Price } from "@/components/mt5/mt5-ui";
import { cn } from "@/lib/utils";

export type LightweightChartHandle = {
  setSymbol: (symbol: ChartSymbol) => void;
  setTimeframe: (timeframe: ChartTimeframe) => void;
  updateCandle: (bar: OHLCBar) => void;
  addMarker: (marker: ChartMarker) => void;
  clearMarkers: () => void;
  setPriceLines: (lines: ChartPriceLine[]) => void;
  reload: () => void;
  fitContent: () => void;
};

export type ChartLoadReason = "initial" | "symbol" | "timeframe";

type Props = {
  symbol: ChartSymbol;
  timeframe: ChartTimeframe;
  seedPrice?: number | null;
  getQuote?: () => RealtimeQuote | null;
  markers?: ChartMarker[];
  priceLines?: ChartPriceLine[];
  className?: string;
  draggableLines?: boolean;
  onPriceLineDragEnd?: (line: ChartPriceLine, newPrice: number) => Promise<void>;
  onChartTap?: (point: { clientX: number; clientY: number }) => void;
  chartTool?: ChartToolMode;
  onChartPointClick?: (point: ChartDrawingPoint) => void;
  drawings?: ChartDrawing[];
  pendingTrend?: ChartDrawingPoint | null;
  showDrawings?: boolean;
  onEraseDrawing?: (id: string) => void;
  onEraseAlert?: (id: string) => void;
  eraseTargets?: { id: string; price: number }[];
  onLoadingChange?: (loading: boolean, reason?: ChartLoadReason) => void;
  onChartStatusChange?: (status: {
    source?: "metaapi" | "quote-fallback";
    error?: string | null;
  }) => void;
};

function dataOptionsForLoad(reason: ChartLoadReason): SetChartDataOptions {
  switch (reason) {
    case "timeframe":
      return { preserveTimeRange: true };
    case "symbol":
    case "initial":
    default:
      return { applyDefaultZoom: true };
  }
}

export const LightweightChart = forwardRef<LightweightChartHandle, Props>(
  function LightweightChart(
    {
      symbol,
      timeframe,
      seedPrice,
      getQuote,
      markers = [],
      priceLines = [],
      className,
      draggableLines = false,
      onPriceLineDragEnd,
      onChartTap,
      chartTool = "select",
      onChartPointClick,
      drawings = [],
      pendingTrend = null,
      showDrawings = true,
      onEraseDrawing,
      onEraseAlert,
      eraseTargets = [],
      onLoadingChange,
      onChartStatusChange,
    },
    ref,
  ) {
    const theme = useThemeStore((s) => s.theme);
    const chart = useLightweightChart(theme, symbol);
    const [dragPrices, setDragPrices] = useState<Record<string, number>>({});
    const [dragError, setDragError] = useState<string | null>(null);
    const [previewPoint, setPreviewPoint] = useState<ChartDrawingPoint | null>(
      null,
    );
    const [layoutTick, setLayoutTick] = useState(0);
    const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
    const coordsRef = useRef<ChartCoordinateApi>({
      priceToCoordinate: () => null,
      timeToCoordinate: () => null,
      coordinateToPrice: () => null,
      coordinateToTime: () => null,
    });
    const onEraseDrawingRef = useRef(onEraseDrawing);
    const onEraseAlertRef = useRef(onEraseAlert);
    const eraseTargetsRef = useRef(eraseTargets);
    const drawingsRef = useRef(drawings);
    const onPriceLineDragEndRef = useRef(onPriceLineDragEnd);
    const onChartTapRef = useRef(onChartTap);
    const onChartPointClickRef = useRef(onChartPointClick);
    const chartToolRef = useRef(chartTool);
    const markersExtraRef = useRef<ChartMarker[]>([]);
    const symbolRef = useRef(symbol);
    const timeframeRef = useRef(timeframe);
    const seedPriceRef = useRef(seedPrice);
    const getQuoteRef = useRef(getQuote);
    const loadGenRef = useRef(0);
    const loadedKeyRef = useRef<string | null>(null);
    const historyReadyRef = useRef(false);
    const onLoadingChangeRef = useRef(onLoadingChange);
    const onChartStatusChangeRef = useRef(onChartStatusChange);
    const setDataRef = useRef(chart.setData);
    const resyncBarsRef = useRef(chart.resyncBars);
    const applySymbolFormatRef = useRef(chart.applySymbolFormat);
    const updateCandleRef = useRef(chart.updateCandle);
    const setMarkersRef = useRef(chart.setMarkers);
    const clearMarkersRef = useRef(chart.clearMarkers);
    const setPriceLinesRef = useRef(chart.setPriceLines);

    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
    getQuoteRef.current = getQuote;
    onLoadingChangeRef.current = onLoadingChange;
    onChartStatusChangeRef.current = onChartStatusChange;
    setDataRef.current = chart.setData;
    resyncBarsRef.current = chart.resyncBars;
    applySymbolFormatRef.current = chart.applySymbolFormat;
    updateCandleRef.current = chart.updateCandle;
    setMarkersRef.current = chart.setMarkers;
    clearMarkersRef.current = chart.clearMarkers;
    setPriceLinesRef.current = chart.setPriceLines;
    onPriceLineDragEndRef.current = onPriceLineDragEnd;
    onChartTapRef.current = onChartTap;
    onChartPointClickRef.current = onChartPointClick;
    chartToolRef.current = chartTool;
    onEraseDrawingRef.current = onEraseDrawing;
    onEraseAlertRef.current = onEraseAlert;
    eraseTargetsRef.current = eraseTargets;
    drawingsRef.current = drawings;

    coordsRef.current = {
      priceToCoordinate: chart.priceToCoordinate,
      timeToCoordinate: chart.timeToCoordinate,
      coordinateToPrice: chart.coordinateToPrice,
      coordinateToTime: chart.coordinateToTime,
    };

    const mergedPriceLines = useMemo(() => {
      return priceLines.map((line) => {
        const override = dragPrices[line.id];
        if (override == null) return line;
        const title =
          line.kind === "sl"
            ? `SL · ${fmtMt5Price(override)}`
            : line.kind === "tp"
              ? `TP · ${fmtMt5Price(override)}`
              : line.title;
        return { ...line, price: override, title };
      });
    }, [priceLines, dragPrices]);

    useEffect(() => {
      setDragPrices((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const line of priceLines) {
          if (next[line.id] != null && Math.abs(next[line.id] - line.price) < 1e-9) {
            delete next[line.id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, [priceLines]);

    const handleDragEnd = useCallback(
      async (line: ChartPriceLine, newPrice: number) => {
        const linesForValidation = mergedPriceLines.map((l) =>
          l.id === line.id ? { ...l, price: newPrice } : l,
        );
        const err = validateStopDrag(line, newPrice, linesForValidation);
        if (err) {
          setDragPrices((prev) => {
            const next = { ...prev };
            delete next[line.id];
            return next;
          });
          setDragError(err);
          throw new Error(err);
        }
        setDragError(null);
        if (!onPriceLineDragEndRef.current) return;
        try {
          await onPriceLineDragEndRef.current(line, newPrice);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Could not update stops";
          setDragError(message);
          throw err;
        }
        setDragPrices((prev) => {
          const next = { ...prev };
          delete next[line.id];
          return next;
        });
      },
      [mergedPriceLines],
    );

    const drag = useDraggableOrderLines({
      containerRef: chart.containerRef,
      ready: chart.ready,
      lines: mergedPriceLines,
      enabled: draggableLines && Boolean(onPriceLineDragEnd),
      priceToCoordinate: chart.priceToCoordinate,
      coordinateToPrice: chart.coordinateToPrice,
      setScrollEnabled: chart.setScrollEnabled,
      onLinePriceChange: (lineId, price) => {
        setDragPrices((prev) => ({ ...prev, [lineId]: price }));
      },
      onDragEnd: handleDragEnd,
    });

    useEffect(() => {
      seedPriceRef.current = seedPrice;
    }, [seedPrice]);

    const loadBars = useCallback(
      async (
        sym: string,
        tf: ChartTimeframe,
        seed: number | null | undefined,
        reason: ChartLoadReason,
      ) => {
        const gen = ++loadGenRef.current;
        const loadKey = `${sym}:${tf}`;
        historyReadyRef.current = false;
        onLoadingChangeRef.current?.(true, reason);

        try {
          if (reason === "symbol" || reason === "initial") {
            applySymbolFormatRef.current(sym);
          }

          const cached = readChartBarCache(sym, tf);
          if (cached && cached.bars.length > 0) {
            setDataRef.current(cached.bars, dataOptionsForLoad(reason));
            historyReadyRef.current = true;
            onChartStatusChangeRef.current?.({
              source: cached.source,
              error: null,
            });
            if (reason !== "timeframe") {
              onLoadingChangeRef.current?.(false, reason);
            }
          }

          const result = await loadChartData(sym, tf, seed);
          if (gen !== loadGenRef.current) return;

          if (result.bars.length > 0) {
            setDataRef.current(result.bars, dataOptionsForLoad(reason));
            historyReadyRef.current = true;
            onChartStatusChangeRef.current?.({
              source: result.source,
              error: result.error ?? null,
            });
          } else if (reason !== "timeframe") {
            onChartStatusChangeRef.current?.({
              source: result.source,
              error: result.error ?? "No chart data available",
            });
          }
        } catch (err) {
          if (reason !== "timeframe") {
            onChartStatusChangeRef.current?.({
              error:
                err instanceof Error ? err.message : "Could not load chart data",
            });
          }
        } finally {
          loadedKeyRef.current = loadKey;
          if (gen === loadGenRef.current) {
            onLoadingChangeRef.current?.(false, reason);
          }
        }
      },
      [],
    );

    useImperativeHandle(ref, () => ({
      setSymbol: (next) => {
        loadedKeyRef.current = null;
        void loadBars(
          next,
          timeframeRef.current,
          resolveSeedPrice(next, seedPriceRef.current),
          "symbol",
        );
      },
      setTimeframe: (next) => {
        loadedKeyRef.current = `${symbolRef.current}:${timeframeRef.current}`;
        void loadBars(
          symbolRef.current,
          next,
          resolveSeedPrice(symbolRef.current, seedPriceRef.current),
          "timeframe",
        );
      },
      updateCandle: (bar) => updateCandleRef.current(bar),
      addMarker: (marker) => {
        markersExtraRef.current = [...markersExtraRef.current, marker];
        setMarkersRef.current([...markers, ...markersExtraRef.current]);
      },
      clearMarkers: () => {
        markersExtraRef.current = [];
        clearMarkersRef.current();
      },
      setPriceLines: (lines) => setPriceLinesRef.current(lines),
      reload: () => {
        loadedKeyRef.current = null;
        void loadBars(
          symbolRef.current,
          timeframeRef.current,
          resolveSeedPrice(symbolRef.current, seedPriceRef.current),
          "symbol",
        );
      },
      fitContent: () => chart.fitContent(),
    }));

    useEffect(() => {
      if (!chart.ready) return;
      const key = `${symbol}:${timeframe}`;
      if (loadedKeyRef.current === key) return;

      const prev = loadedKeyRef.current;
      let reason: ChartLoadReason = "initial";
      if (prev) {
        const [prevSym, prevTf] = prev.split(":");
        if (prevSym === symbol && prevTf !== timeframe) reason = "timeframe";
        else if (prevSym !== symbol) reason = "symbol";
      }

      void loadBars(
        symbol,
        timeframe,
        resolveSeedPrice(symbol, seedPriceRef.current),
        reason,
      );
    }, [chart.ready, symbol, timeframe, loadBars]);

    useEffect(() => {
      if (!chart.ready) return;
      const activeSymbol = symbol;
      const activeTf = timeframe;
      const unsub = subscribeRealtimeUpdates(
        activeSymbol,
        activeTf,
        () => getQuoteRef.current?.() ?? null,
        (bar) => {
          if (
            !historyReadyRef.current ||
            symbolRef.current !== activeSymbol ||
            timeframeRef.current !== activeTf
          ) {
            return;
          }
          updateCandleRef.current(bar);
        },
        {
          isActive: () => historyReadyRef.current,
          onResync: (bars) => {
            if (
              !historyReadyRef.current ||
              symbolRef.current !== activeSymbol ||
              timeframeRef.current !== activeTf
            ) {
              return;
            }
            resyncBarsRef.current(bars, { preserveTimeRange: true });
          },
        },
      );
      return unsub;
    }, [symbol, timeframe, chart.ready]);

    useEffect(() => {
      if (!chart.ready) return;
      setMarkersRef.current([...markers, ...markersExtraRef.current]);
    }, [markers, chart.ready]);

    useEffect(() => {
      if (!chart.ready) return;
      setPriceLinesRef.current(mergedPriceLines);
    }, [mergedPriceLines, chart.ready]);

    useEffect(() => {
      if (!chart.ready) return;
      return chart.subscribeChartLayout(() => {
        setLayoutTick((n) => n + 1);
        const el = chart.containerRef.current;
        if (el) {
          setChartSize({ width: el.clientWidth, height: el.clientHeight });
        }
      });
    }, [chart.ready, chart.subscribeChartLayout, chart.containerRef]);

    useEffect(() => {
      if (!chart.ready || !chart.containerRef.current) return;
      const el = chart.containerRef.current;
      const ro = new ResizeObserver(() => {
        setChartSize({ width: el.clientWidth, height: el.clientHeight });
      });
      ro.observe(el);
      setChartSize({ width: el.clientWidth, height: el.clientHeight });
      return () => ro.disconnect();
    }, [chart.ready, chart.containerRef]);

    const trendlines = useMemo(
      () =>
        drawings.filter(
          (d): d is Extract<ChartDrawing, { type: "trendline" }> =>
            d.type === "trendline",
        ),
      [drawings],
    );

    useEffect(() => {
      if (!chart.ready || !chart.containerRef.current) return;
      const target = chart.containerRef.current;
      let start: { x: number; y: number; t: number } | null = null;
      let previewRaf = 0;

      function onPointerDown(e: PointerEvent) {
        start = { x: e.clientX, y: e.clientY, t: Date.now() };
      }

      function onPointerUp(e: PointerEvent) {
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        const dt = Date.now() - start.t;
        const isTap = Math.hypot(dx, dy) < 12 && dt < 400;
        if (isTap) {
          const tool = chartToolRef.current;
          if (tool === "select") {
            onChartTapRef.current?.({ clientX: e.clientX, clientY: e.clientY });
          } else if (tool === "erase") {
            const point = resolveChartPointFromClient(
              e.clientX,
              e.clientY,
              target,
              coordsRef.current,
            );
            if (point) {
              const hit = findDrawingEraseTarget(
                point,
                drawingsRef.current,
                eraseTargetsRef.current,
              );
              if (hit?.type === "drawing") onEraseDrawingRef.current?.(hit.id);
              if (hit?.type === "alert") onEraseAlertRef.current?.(hit.id);
            }
          } else if (onChartPointClickRef.current) {
            const point = resolveChartPointFromClient(
              e.clientX,
              e.clientY,
              target,
              coordsRef.current,
            );
            if (point) onChartPointClickRef.current(point);
          }
        }
        start = null;
      }

      function onPointerMove(e: PointerEvent) {
        if (!pendingTrend || chartToolRef.current !== "trendline") {
          setPreviewPoint(null);
          return;
        }
        cancelAnimationFrame(previewRaf);
        previewRaf = requestAnimationFrame(() => {
          const point = resolveChartPointFromClient(
            e.clientX,
            e.clientY,
            target,
            coordsRef.current,
          );
          setPreviewPoint(point);
        });
      }

      target.addEventListener("pointerdown", onPointerDown);
      target.addEventListener("pointerup", onPointerUp);
      target.addEventListener("pointermove", onPointerMove);
      return () => {
        target.removeEventListener("pointerdown", onPointerDown);
        target.removeEventListener("pointerup", onPointerUp);
        target.removeEventListener("pointermove", onPointerMove);
        cancelAnimationFrame(previewRaf);
      };
    }, [chart.ready, chart.containerRef, pendingTrend]);

    return (
      <div className="relative h-full w-full">
        <div
          ref={chart.containerRef}
          className={cn(
            className,
            drag.cursor && "touch-none",
            chartTool !== "select" && chartTool !== "erase" && "cursor-crosshair",
            chartTool === "erase" && "cursor-cell",
          )}
          style={{
            minHeight: 180,
            cursor:
              drag.cursor ??
              (chartTool !== "select" && chartTool !== "erase"
                ? "crosshair"
                : chartTool === "erase"
                  ? "cell"
                  : undefined),
          }}
          role="img"
          aria-label={`${symbol} candlestick chart`}
        />
        <ChartDrawingOverlay
          ready={chart.ready}
          layoutVersion={layoutTick}
          coords={coordsRef.current}
          trendlines={trendlines}
          pendingTrend={pendingTrend}
          previewPoint={previewPoint}
          showDrawings={showDrawings}
          eraseMode={chartTool === "erase"}
          onEraseDrawing={onEraseDrawing}
          width={chartSize.width}
          height={chartSize.height}
        />
        {drag.dragLabel && (
          <div
            className="pointer-events-none absolute right-12 z-10 rounded border border-[var(--mt5-divider)] bg-[var(--mt5-surface)]/95 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--mt5-text)] shadow-sm"
            style={{ top: Math.max(4, drag.dragLabel.y - 10) }}
          >
            {fmtMt5Price(drag.dragLabel.price)}
          </div>
        )}
        {drag.pending && (
          <div
            className="absolute bottom-3 left-2 right-2 z-20 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-[var(--mt5-divider)] bg-[var(--mt5-surface)]/98 px-3 py-2 shadow-lg backdrop-blur-sm max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:left-1/2 sm:right-auto sm:max-w-md sm:-translate-x-1/2"
            role="dialog"
            aria-label="Confirm stop modification"
          >
            <p className="min-w-0 flex-1 text-center text-[11px] font-medium text-[var(--mt5-text)] sm:text-left">
              Move{" "}
              <span className="font-semibold uppercase">
                {drag.pending.line.kind}
              </span>{" "}
              to {fmtMt5Price(drag.pending.newPrice)}?
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={drag.saving}
                onClick={() => drag.cancelPending()}
                className="rounded-md border border-[var(--mt5-divider)] px-3 py-1.5 text-[11px] font-semibold text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={drag.saving}
                onClick={() => void drag.confirmPending()}
                className="rounded-md bg-[#4a9eff] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#3b8ee8] disabled:opacity-50"
              >
                {drag.saving ? "Sending…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
        {drag.saving && !drag.pending && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-[var(--mt5-surface)]/90 px-2 py-1 text-[10px] text-[var(--mt5-muted)]">
            Sending to broker…
          </div>
        )}
        {dragError && (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-20 rounded-md border border-[#ff5252]/30 bg-[#ff5252]/10 px-2 py-1 text-[10px] text-[#ff5252] max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]">
            {dragError}
          </div>
        )}
      </div>
    );
  },
);
