/** Supported candle timeframes — extend when backend adds more intervals. */
export type ChartTimeframe = "M1" | "M5" | "M15" | "H1" | "D1";

export const CHART_TIMEFRAMES: ChartTimeframe[] = [
  "M1",
  "M5",
  "M15",
  "H1",
  "D1",
];

/** OHLC bar — `time` is UTCTimestamp (seconds). */
export type OHLCBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartSymbol = string;

export type ChartMarker = {
  time: number;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  text?: string;
};

export type ChartPriceLine = {
  id: string;
  price: number;
  color: string;
  title?: string;
  lineStyle?: 0 | 1 | 2 | 3;
};

export const MAX_HISTORICAL_BARS = 500;
