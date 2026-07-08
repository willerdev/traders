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
import { useLightweightChart } from "@/components/charts/use-lightweight-chart";

export type LightweightChartHandle = {
  setSymbol: (symbol: ChartSymbol) => void;
  setTimeframe: (timeframe: ChartTimeframe) => void;
  updateCandle: (bar: OHLCBar) => void;
  addMarker: (marker: ChartMarker) => void;
  clearMarkers: () => void;
  setPriceLines: (lines: ChartPriceLine[]) => void;
  reload: () => void;
};

type Props = {
  symbol: ChartSymbol;
  timeframe: ChartTimeframe;
  seedPrice?: number | null;
  getQuote?: () => RealtimeQuote | null;
  markers?: ChartMarker[];
  priceLines?: ChartPriceLine[];
  className?: string;
  onLoadingChange?: (loading: boolean) => void;
  onChartStatusChange?: (status: {
    source?: "metaapi" | "quote-fallback";
    error?: string | null;
  }) => void;
};

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
      async (sym: string, tf: ChartTimeframe, seed?: number | null) => {
        const gen = ++loadGenRef.current;
        onLoadingChange?.(true);
        try {
          applySymbolFormatRef.current(sym);
          const result = await loadChartData(sym, tf, seed);
          if (gen !== loadGenRef.current) return;
          if (result.bars.length > 0) {
            setDataRef.current(result.bars, { fit: true });
            onChartStatusChange?.({
              source: result.source,
              error: result.error ?? null,
            });
          } else {
            onChartStatusChange?.({
              source: result.source,
              error: result.error ?? "No chart data available",
            });
          }
        } catch (err) {
          onChartStatusChange?.({
            error:
              err instanceof Error ? err.message : "Could not load chart data",
          });
        } finally {
          if (gen === loadGenRef.current) {
            onLoadingChange?.(false);
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
        );
      },
      setTimeframe: (next) => {
        void loadBars(
          symbolRef.current,
          next,
          resolveSeedPrice(symbolRef.current, seedPriceRef.current),
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
        );
      },
    }));

    useEffect(() => {
      if (!chart.ready) return;
      void loadBars(
        symbol,
        timeframe,
        resolveSeedPrice(symbol, seedPriceRef.current),
      );
    }, [chart.ready, symbol, timeframe, loadBars]);

    useEffect(() => {
      if (!chart.ready) return;
      const activeSymbol = symbol;
      const unsub = subscribeRealtimeUpdates(
        activeSymbol,
        timeframe,
        () => getQuoteRef.current?.() ?? null,
        (bar) => {
          if (symbolRef.current === activeSymbol) {
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
