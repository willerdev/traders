"use client";

import { useCallback, useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, CandlestickSeriesPartialOptions } from "lightweight-charts";
import { createChartOptions, createCandlestickSeriesOptions, type ChartThemeMode } from "@/components/charts/chart-config";
import type {
  ChartMarker,
  ChartPriceLine,
  OHLCBar,
} from "@/components/charts/chart-types";

type CandlestickSeries = ISeriesApi<"Candlestick">;

export type UseLightweightChartResult = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  setData: (bars: OHLCBar[]) => void;
  updateCandle: (bar: OHLCBar) => void;
  setMarkers: (markers: ChartMarker[]) => void;
  clearMarkers: () => void;
  setPriceLines: (lines: ChartPriceLine[]) => void;
  applyTheme: (mode: ChartThemeMode) => void;
  fitContent: () => void;
};

export function useLightweightChart(theme: ChartThemeMode): UseLightweightChartResult {
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let ro: ResizeObserver | null = null;

    void (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const chart = lc.createChart(containerRef.current, createChartOptions(theme));
      const series = chart.addSeries(
        lc.CandlestickSeries,
        createCandlestickSeriesOptions() as CandlestickSeriesPartialOptions,
      );
      markersRef.current = lc.createSeriesMarkers(
        series,
        [],
      ) as { setMarkers: (markers: unknown[]) => void };

      chartRef.current = chart;
      seriesRef.current = series;

      ro = new ResizeObserver(() => {
        chartRef.current?.timeScale().fitContent();
      });
      ro.observe(el);
    })();

    return () => {
      disposed = true;
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
  }, [theme]);

  const setData = useCallback((bars: OHLCBar[]) => {
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
    chartRef.current?.timeScale().fitContent();
  }, []);

  const updateCandle = useCallback((bar: OHLCBar) => {
    const bars = barsRef.current;
    const last = bars[bars.length - 1];
    if (last && last.time === bar.time) {
      bars[bars.length - 1] = bar;
    } else if (!last || bar.time > last.time) {
      bars.push(bar);
      if (bars.length > 500) bars.shift();
    }
    seriesRef.current?.update({
      time: bar.time as import("lightweight-charts").UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    });
  }, []);

  const setMarkers = useCallback((markers: ChartMarker[]) => {
    markersRef.current?.setMarkers(
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
    markersRef.current?.setMarkers([]);
  }, []);

  const setPriceLines = useCallback((lines: ChartPriceLine[]) => {
    const series = seriesRef.current;
    if (!series) return;

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

  const applyTheme = useCallback(
    (mode: ChartThemeMode) => {
      chartRef.current?.applyOptions(createChartOptions(mode));
    },
    [],
  );

  const fitContent = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  return {
    containerRef,
    setData,
    updateCandle,
    setMarkers,
    clearMarkers,
    setPriceLines,
    applyTheme,
    fitContent,
  };
}
