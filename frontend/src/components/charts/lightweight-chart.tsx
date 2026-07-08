"use client";

import {
  forwardRef,
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
    const getQuoteRef = useRef(getQuote);
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
    getQuoteRef.current = getQuote;

    const loadBars = async (sym: string, tf: ChartTimeframe, seed?: number | null) => {
      onLoadingChange?.(true);
      try {
        const bars = await loadHistoricalOHLC(sym, tf, seed);
        chart.setData(bars);
      } finally {
        onLoadingChange?.(false);
      }
    };

    useImperativeHandle(ref, () => ({
      setSymbol: (next) => {
        void loadBars(next, timeframeRef.current, seedPrice);
      },
      setTimeframe: (next) => {
        void loadBars(symbolRef.current, next, seedPrice);
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
        void loadBars(symbolRef.current, timeframeRef.current, seedPrice);
      },
    }));

    useEffect(() => {
      chart.applyTheme(theme);
    }, [theme, chart]);

    useEffect(() => {
      void loadBars(symbol, timeframe, seedPrice);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when symbol/tf/seed change
    }, [symbol, timeframe, seedPrice]);

    useEffect(() => {
      const unsub = subscribeRealtimeUpdates(
        symbol,
        timeframe,
        () => getQuoteRef.current?.() ?? null,
        (bar) => chart.updateCandle(bar),
      );
      return unsub;
    }, [symbol, timeframe, chart]);

    useEffect(() => {
      chart.setMarkers([...markers, ...markersExtraRef.current]);
    }, [markers, chart]);

    useEffect(() => {
      chart.setPriceLines(priceLines);
    }, [priceLines, chart]);

    return (
      <div
        ref={chart.containerRef}
        className={className}
        role="img"
        aria-label={`${symbol} candlestick chart`}
      />
    );
  },
);
