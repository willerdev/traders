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
  loadHistoricalOHLC,
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
    },
    ref,
  ) {
    const theme = useThemeStore((s) => s.theme);
    const chart = useLightweightChart(theme);
    const markersExtraRef = useRef<ChartMarker[]>([]);
    const symbolRef = useRef(symbol);
    const timeframeRef = useRef(timeframe);
    const seedPriceRef = useRef(seedPrice);
    const getQuoteRef = useRef(getQuote);
    const loadedKeyRef = useRef<string | null>(null);
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
    getQuoteRef.current = getQuote;

    useEffect(() => {
      seedPriceRef.current = seedPrice;
    }, [seedPrice]);

    const loadBars = useCallback(
      async (sym: string, tf: ChartTimeframe, seed?: number | null) => {
        onLoadingChange?.(true);
        try {
          const bars = await loadHistoricalOHLC(sym, tf, seed);
          chart.setData(bars, { fit: true });
          loadedKeyRef.current = `${sym}:${tf}`;
        } finally {
          onLoadingChange?.(false);
        }
      },
      [chart, onLoadingChange],
    );

    useImperativeHandle(ref, () => ({
      setSymbol: (next) => {
        void loadBars(next, timeframeRef.current, seedPriceRef.current);
      },
      setTimeframe: (next) => {
        void loadBars(symbolRef.current, next, seedPriceRef.current);
      },
      updateCandle: chart.updateCandle,
      addMarker: (marker) => {
        markersExtraRef.current = [...markersExtraRef.current, marker];
        chart.setMarkers([...markers, ...markersExtraRef.current]);
      },
      clearMarkers: () => {
        markersExtraRef.current = [];
        chart.clearMarkers();
      },
      setPriceLines: chart.setPriceLines,
      reload: () => {
        void loadBars(symbolRef.current, timeframeRef.current, seedPriceRef.current);
      },
    }));

    useEffect(() => {
      if (!chart.ready) return;
      const key = `${symbol}:${timeframe}`;
      if (loadedKeyRef.current === key) return;
      void loadBars(symbol, timeframe, seedPriceRef.current ?? undefined);
    }, [chart.ready, symbol, timeframe, loadBars]);

    useEffect(() => {
      if (!chart.ready) return;
      const unsub = subscribeRealtimeUpdates(
        symbol,
        timeframe,
        () => getQuoteRef.current?.() ?? null,
        (bar) => chart.updateCandle(bar),
      );
      return unsub;
    }, [symbol, timeframe, chart.ready, chart]);

    useEffect(() => {
      if (!chart.ready) return;
      chart.setMarkers([...markers, ...markersExtraRef.current]);
    }, [markers, chart.ready, chart]);

    useEffect(() => {
      if (!chart.ready) return;
      chart.setPriceLines(priceLines);
    }, [priceLines, chart.ready, chart]);

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
