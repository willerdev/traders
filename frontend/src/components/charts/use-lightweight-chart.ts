"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, CandlestickSeriesPartialOptions } from "lightweight-charts";
import { createChartOptions, createCandlestickSeriesOptions, applyDefaultVisibleRange, type ChartThemeMode } from "@/components/charts/chart-config";
import { priceFormatForSymbol } from "@/components/charts/chart-price-format";
import { MAX_HISTORICAL_BARS } from "@/components/charts/chart-types";
import type {
  ChartMarker,
  ChartPriceLine,
  OHLCBar,
} from "@/components/charts/chart-types";

type CandlestickSeries = ISeriesApi<"Candlestick">;

export type SetChartDataOptions = {
  fit?: boolean;
  /** Keep the same on-screen time window (timeframe switches). */
  preserveTimeRange?: boolean;
  /** Initial zoom showing ~140 bars. */
  applyDefaultZoom?: boolean;
};

export type UseLightweightChartResult = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  ready: boolean;
  setData: (bars: OHLCBar[], options?: SetChartDataOptions) => void;
  resyncBars: (bars: OHLCBar[], options?: SetChartDataOptions) => void;
  updateCandle: (bar: OHLCBar) => void;
  setMarkers: (markers: ChartMarker[]) => void;
  clearMarkers: () => void;
  setPriceLines: (lines: ChartPriceLine[]) => void;
  applyTheme: (mode: ChartThemeMode) => void;
  applySymbolFormat: (symbol: string) => void;
  fitContent: () => void;
  priceToCoordinate: (price: number) => number | null;
  coordinateToPrice: (y: number) => number | null;
  setScrollEnabled: (enabled: boolean) => void;
};

export function useLightweightChart(
  theme: ChartThemeMode,
  symbol: string,
): UseLightweightChartResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<CandlestickSeries | null>(null);
  const markersRef = useRef<{ setMarkers: (markers: unknown[]) => void } | null>(
    null,
  );
  const priceLinesRef = useRef<Map<string, ReturnType<CandlestickSeries["createPriceLine"]>>>(
    new Map(),
  );
  const barsRef = useRef<OHLCBar[]>([]);
  const pendingBarsRef = useRef<OHLCBar[] | null>(null);
  const pendingMarkersRef = useRef<ChartMarker[] | null>(null);
  const pendingPriceLinesRef = useRef<ChartPriceLine[] | null>(null);
  const [ready, setReady] = useState(false);

  const applyData = useCallback((bars: OHLCBar[], options?: SetChartDataOptions) => {
    const chart = chartRef.current;
    const savedTimeRange =
      options?.preserveTimeRange && chart
        ? chart.timeScale().getVisibleRange()
        : null;

    barsRef.current = bars;
    seriesRef.current?.setData(
      bars.map((b) => ({
        time: b.time as import("lightweight-charts").UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );

    if (!chart) return;

    if (options?.applyDefaultZoom) {
      applyDefaultVisibleRange(chart, bars.length);
      return;
    }

    if (options?.fit) {
      chart.timeScale().fitContent();
      return;
    }

    if (savedTimeRange) {
      try {
        chart.timeScale().setVisibleRange(savedTimeRange);
      } catch {
        if (bars.length > 0) {
          applyDefaultVisibleRange(chart, bars.length);
        }
      }
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let ro: ResizeObserver | null = null;

    void (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const pf = priceFormatForSymbol(symbol);
      const chart = lc.createChart(containerRef.current, createChartOptions(theme));
      const series = chart.addSeries(
        lc.CandlestickSeries,
        createCandlestickSeriesOptions(pf) as CandlestickSeriesPartialOptions,
      );
      markersRef.current = lc.createSeriesMarkers(
        series,
        [],
      ) as { setMarkers: (markers: unknown[]) => void };

      chartRef.current = chart;
      seriesRef.current = series;

      if (pendingBarsRef.current) {
        applyData(pendingBarsRef.current, { applyDefaultZoom: true });
        pendingBarsRef.current = null;
      }
      if (pendingMarkersRef.current) {
        markersRef.current.setMarkers(
          pendingMarkersRef.current.map((m) => ({
            time: m.time as import("lightweight-charts").UTCTimestamp,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.text,
          })),
        );
        pendingMarkersRef.current = null;
      }
      if (pendingPriceLinesRef.current) {
        for (const line of pendingPriceLinesRef.current) {
          const pl = series.createPriceLine({
            price: line.price,
            color: line.color,
            title: line.title ?? "",
            lineStyle: line.lineStyle ?? 2,
            axisLabelVisible: true,
            lineWidth: 1,
          });
          priceLinesRef.current.set(line.id, pl);
        }
        pendingPriceLinesRef.current = null;
      }

      ro = new ResizeObserver(() => {
        if (chartRef.current && containerRef.current) {
          const { width, height } = containerRef.current.getBoundingClientRect();
          if (width > 0 && height > 0) {
            chartRef.current.applyOptions({ width, height });
          }
        }
      });
      ro.observe(el);

      if (!disposed) setReady(true);
    })();

    const remeasureChart = () => {
      const chart = chartRef.current;
      const container = containerRef.current;
      if (!chart || !container) return;
      const { width, height } = container.getBoundingClientRect();
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height });
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      requestAnimationFrame(() => {
        remeasureChart();
        requestAnimationFrame(remeasureChart);
      });
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      disposed = true;
      setReady(false);
      ro?.disconnect();
      priceLinesRef.current.forEach((line) => {
        try {
          seriesRef.current?.removePriceLine(line);
        } catch {
          /* ignore */
        }
      });
      priceLinesRef.current.clear();
      markersRef.current = null;
      seriesRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
    };
    // Chart instance is created once; theme updates via applyTheme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) chartRef.current?.applyOptions(createChartOptions(theme));
  }, [theme, ready]);

  const applySymbolFormat = useCallback((sym: string) => {
    if (!seriesRef.current) return;
    const pf = priceFormatForSymbol(sym);
    seriesRef.current.applyOptions(
      createCandlestickSeriesOptions(pf) as CandlestickSeriesPartialOptions,
    );
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !ready) return;
    applySymbolFormat(symbol);
  }, [symbol, ready, applySymbolFormat]);

  const setData = useCallback(
    (bars: OHLCBar[], options?: SetChartDataOptions) => {
      if (!seriesRef.current) {
        pendingBarsRef.current = bars;
        return;
      }
      applyData(bars, options);
    },
    [applyData],
  );

  const resyncBars = useCallback(
    (tail: OHLCBar[], options?: SetChartDataOptions) => {
      if (tail.length === 0) return;
      if (!seriesRef.current) {
        pendingBarsRef.current = tail;
        return;
      }

      const firstTailTime = tail[0].time;
      const byTime = new Map<number, OHLCBar>();
      for (const bar of barsRef.current) {
        if (bar.time < firstTailTime) {
          byTime.set(bar.time, bar);
        }
      }
      for (const bar of tail) {
        byTime.set(bar.time, bar);
      }
      let merged = [...byTime.values()].sort((a, b) => a.time - b.time);
      if (merged.length > MAX_HISTORICAL_BARS) {
        merged = merged.slice(merged.length - MAX_HISTORICAL_BARS);
      }
      applyData(merged, options);
    },
    [applyData],
  );

  const updateCandle = useCallback((bar: OHLCBar) => {
    if (!seriesRef.current) return;
    const bars = barsRef.current;
    if (bars.length === 0) {
      applyData([bar], { applyDefaultZoom: true });
      return;
    }
    const last = bars[bars.length - 1];
    if (last && bar.time < last.time) {
      return;
    }
    if (last && last.time === bar.time) {
      bars[bars.length - 1] = bar;
    } else if (!last || bar.time > last.time) {
      bars.push(bar);
      if (bars.length > MAX_HISTORICAL_BARS) bars.shift();
    }
    seriesRef.current.update({
      time: bar.time as import("lightweight-charts").UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    });
  }, [applyData]);

  const setMarkers = useCallback((markers: ChartMarker[]) => {
    if (!markersRef.current) {
      pendingMarkersRef.current = markers;
      return;
    }
    markersRef.current.setMarkers(
      markers.map((m) => ({
        time: m.time as import("lightweight-charts").UTCTimestamp,
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      })),
    );
  }, []);

  const clearMarkers = useCallback(() => {
    pendingMarkersRef.current = [];
    markersRef.current?.setMarkers([]);
  }, []);

  const setPriceLines = useCallback((lines: ChartPriceLine[]) => {
    const series = seriesRef.current;
    if (!series) {
      pendingPriceLinesRef.current = lines;
      return;
    }

    const nextIds = new Set(lines.map((l) => l.id));
    for (const [id, line] of priceLinesRef.current) {
      if (!nextIds.has(id)) {
        series.removePriceLine(line);
        priceLinesRef.current.delete(id);
      }
    }

    for (const line of lines) {
      const existing = priceLinesRef.current.get(line.id);
      if (existing) {
        existing.applyOptions({
          price: line.price,
          color: line.color,
          title: line.title ?? "",
          lineStyle: line.lineStyle ?? 2,
        });
      } else {
        const pl = series.createPriceLine({
          price: line.price,
          color: line.color,
          title: line.title ?? "",
          lineStyle: line.lineStyle ?? 2,
          axisLabelVisible: true,
          lineWidth: 1,
        });
        priceLinesRef.current.set(line.id, pl);
      }
    }
  }, []);

  const applyTheme = useCallback((mode: ChartThemeMode) => {
    chartRef.current?.applyOptions(createChartOptions(mode));
  }, []);

  const fitContent = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  const priceToCoordinate = useCallback((price: number) => {
    const y = seriesRef.current?.priceToCoordinate(price);
    return y ?? null;
  }, []);

  const coordinateToPrice = useCallback((y: number) => {
    const price = seriesRef.current?.coordinateToPrice(y);
    return price ?? null;
  }, []);

  const setScrollEnabled = useCallback((enabled: boolean) => {
    chartRef.current?.applyOptions({
      handleScroll: enabled,
      handleScale: enabled,
    });
  }, []);

  return {
    containerRef,
    ready,
    setData,
    resyncBars,
    updateCandle,
    setMarkers,
    clearMarkers,
    setPriceLines,
    applyTheme,
    applySymbolFormat,
    fitContent,
    priceToCoordinate,
    coordinateToPrice,
    setScrollEnabled,
  };
}
