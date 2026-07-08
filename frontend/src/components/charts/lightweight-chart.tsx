"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useThemeStore } from "@/stores/theme";
import {
  loadChartData,
  resolveSeedPrice,
  subscribeRealtimeUpdates,
  type RealtimeQuote,
} from "@/components/charts/chart-data.service";
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

export type LightweightChartHandle = {
  setSymbol: (symbol: ChartSymbol) => void;
  setTimeframe: (timeframe: ChartTimeframe) => void;
  updateCandle: (bar: OHLCBar) => void;
  addMarker: (marker: ChartMarker) => void;
  clearMarkers: () => void;
  setPriceLines: (lines: ChartPriceLine[]) => void;
  reload: () => void;
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
      return { applyDefaultZoom: true };
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
      onLoadingChange,
      onChartStatusChange,
    },
    ref,
  ) {
    const theme = useThemeStore((s) => s.theme);
    const chart = useLightweightChart(theme, symbol);
    const markersExtraRef = useRef<ChartMarker[]>([]);
    const symbolRef = useRef(symbol);
    const timeframeRef = useRef(timeframe);
    const seedPriceRef = useRef(seedPrice);
    const getQuoteRef = useRef(getQuote);
    const loadGenRef = useRef(0);
    const loadedKeyRef = useRef<string | null>(null);
    const setDataRef = useRef(chart.setData);
    const applySymbolFormatRef = useRef(chart.applySymbolFormat);
    const updateCandleRef = useRef(chart.updateCandle);
    const setMarkersRef = useRef(chart.setMarkers);
    const clearMarkersRef = useRef(chart.clearMarkers);
    const setPriceLinesRef = useRef(chart.setPriceLines);

    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
    getQuoteRef.current = getQuote;
    setDataRef.current = chart.setData;
    applySymbolFormatRef.current = chart.applySymbolFormat;
    updateCandleRef.current = chart.updateCandle;
    setMarkersRef.current = chart.setMarkers;
    clearMarkersRef.current = chart.clearMarkers;
    setPriceLinesRef.current = chart.setPriceLines;

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
        onLoadingChange?.(true, reason);
        try {
          if (reason === "symbol") {
            applySymbolFormatRef.current(sym);
          }
          const result = await loadChartData(sym, tf, seed);
          if (gen !== loadGenRef.current) return;
          if (result.bars.length > 0) {
            setDataRef.current(result.bars, dataOptionsForLoad(reason));
            loadedKeyRef.current = `${sym}:${tf}`;
            onChartStatusChange?.({
              source: result.source,
              error: result.error ?? null,
            });
          } else if (reason !== "timeframe") {
            onChartStatusChange?.({
              source: result.source,
              error: result.error ?? "No chart data available",
            });
          }
        } catch (err) {
          if (reason !== "timeframe") {
            onChartStatusChange?.({
              error:
                err instanceof Error ? err.message : "Could not load chart data",
            });
          }
        } finally {
          if (gen === loadGenRef.current) {
            onLoadingChange?.(false, reason);
          }
        }
      },
      [onLoadingChange, onChartStatusChange],
    );

    useImperativeHandle(ref, () => ({
      setSymbol: (next) => {
        void loadBars(
          next,
          timeframeRef.current,
          resolveSeedPrice(next, seedPriceRef.current),
          "symbol",
        );
      },
      setTimeframe: (next) => {
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
        void loadBars(
          symbolRef.current,
          timeframeRef.current,
          resolveSeedPrice(symbolRef.current, seedPriceRef.current),
          "symbol",
        );
      },
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
            symbolRef.current === activeSymbol &&
            timeframeRef.current === activeTf
          ) {
            updateCandleRef.current(bar);
          }
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
      setPriceLinesRef.current(priceLines);
    }, [priceLines, chart.ready]);

    return (
      <div
        ref={chart.containerRef}
        className={className}
        style={{ minHeight: 180 }}
        role="img"
        aria-label={`${symbol} candlestick chart`}
      />
    );
  },
);
