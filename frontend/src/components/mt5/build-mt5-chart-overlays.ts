import type { OpenSetupItem, UserMt5Trade } from "@/lib/api";
import type { ChartMarker, ChartPriceLine, ChartTimeframe } from "@/components/charts/chart-types";
import { MT5_BUY, MT5_SELL } from "@/components/mt5/mt5-ui";

const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
  D1: 86400,
};

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function alignedNow(intervalSec: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor(now / intervalSec) * intervalSec;
}

function pushLine(
  lines: ChartPriceLine[],
  seen: Set<string>,
  line: ChartPriceLine,
): void {
  if (seen.has(line.id)) return;
  seen.add(line.id);
  lines.push(line);
}

function addTradeOverlay(
  lines: ChartPriceLine[],
  marks: ChartMarker[],
  seenLines: Set<string>,
  trade: UserMt5Trade,
  kind: "running" | "limit",
  barTime: number,
): void {
  const isBuy = trade.direction.toUpperCase() === "BUY";
  const dirColor = isBuy ? MT5_BUY : MT5_SELL;
  const id = trade.positionId ?? trade.orderId ?? trade.signalId ?? trade.symbol;

  if (trade.stopLoss != null) {
    pushLine(lines, seenLines, {
      id: `${id}-sl`,
      price: trade.stopLoss,
      color: MT5_SELL,
      title: "SL",
      lineStyle: 2,
    });
  }
  if (trade.takeProfit != null) {
    pushLine(lines, seenLines, {
      id: `${id}-tp`,
      price: trade.takeProfit,
      color: MT5_BUY,
      title: "TP",
      lineStyle: 2,
    });
  }

  const entry =
    trade.openPrice ??
    (trade.entryMin != null && trade.entryMax != null
      ? (trade.entryMin + trade.entryMax) / 2
      : trade.entryMin ?? trade.entryMax);

  if (entry != null) {
    pushLine(lines, seenLines, {
      id: `${id}-entry`,
      price: entry,
      color: dirColor,
      title: kind === "limit" ? "Limit" : "Entry",
      lineStyle: kind === "limit" ? 2 : 0,
    });
  }

  marks.push({
    time: barTime,
    position: isBuy ? "belowBar" : "aboveBar",
    color: dirColor,
    shape: isBuy ? "arrowUp" : "arrowDown",
    text: kind === "limit" ? "Limit" : "Open",
  });
}

function addSetupOverlay(
  lines: ChartPriceLine[],
  marks: ChartMarker[],
  seenLines: Set<string>,
  setup: OpenSetupItem,
  barTime: number,
): void {
  const isBuy = setup.direction.toUpperCase() === "BUY";
  const dirColor = isBuy ? MT5_BUY : MT5_SELL;
  const id = setup.signalId;
  const lt = setup.liveTrade;

  const sl = lt?.stopLoss ?? setup.stopLoss;
  const tp = lt?.takeProfit ?? setup.takeProfit;

  if (sl != null) {
    pushLine(lines, seenLines, {
      id: `${id}-sl`,
      price: sl,
      color: MT5_SELL,
      title: "SL",
      lineStyle: 2,
    });
  }
  if (tp != null) {
    pushLine(lines, seenLines, {
      id: `${id}-tp`,
      price: tp,
      color: MT5_BUY,
      title: "TP",
      lineStyle: 2,
    });
  }

  if (lt?.status === "open") {
    const entry =
      lt.openPrice ?? lt.entryPrice ?? (setup.entryMin + setup.entryMax) / 2;
    if (entry != null) {
      pushLine(lines, seenLines, {
        id: `${id}-entry`,
        price: entry,
        color: dirColor,
        title: "Entry",
        lineStyle: 0,
      });
    }
    marks.push({
      time: barTime,
      position: isBuy ? "belowBar" : "aboveBar",
      color: dirColor,
      shape: isBuy ? "arrowUp" : "arrowDown",
      text: "Open",
    });
    return;
  }

  const limitPrice = lt?.openPrice ?? lt?.entryPrice;
  if (lt?.status === "pending" && limitPrice != null) {
    pushLine(lines, seenLines, {
      id: `${id}-limit`,
      price: limitPrice,
      color: dirColor,
      title: "Limit",
      lineStyle: 2,
    });
    marks.push({
      time: barTime,
      position: isBuy ? "belowBar" : "aboveBar",
      color: dirColor,
      shape: isBuy ? "arrowUp" : "arrowDown",
      text: "Limit",
    });
    return;
  }

  pushLine(lines, seenLines, {
    id: `${id}-entry-min`,
    price: setup.entryMin,
    color: dirColor,
    title: "Entry",
    lineStyle: 2,
  });
  if (setup.entryMax !== setup.entryMin) {
    pushLine(lines, seenLines, {
      id: `${id}-entry-max`,
      price: setup.entryMax,
      color: dirColor,
      title: "Entry",
      lineStyle: 2,
    });
  }

  marks.push({
    time: barTime,
    position: isBuy ? "belowBar" : "aboveBar",
    color: dirColor,
    shape: isBuy ? "arrowUp" : "arrowDown",
    text: "Setup",
  });
}

export type Mt5ChartOverlaySummary = {
  running: number;
  limits: number;
  setups: number;
  total: number;
};

export function buildMt5ChartOverlays(input: {
  selectedSymbol: string;
  timeframe: ChartTimeframe;
  runningTrades: UserMt5Trade[];
  limitTrades: UserMt5Trade[];
  setups: OpenSetupItem[];
}): {
  priceLines: ChartPriceLine[];
  markers: ChartMarker[];
  summary: Mt5ChartOverlaySummary;
} {
  const sym = normalizeSymbol(input.selectedSymbol);
  const barTime = alignedNow(TIMEFRAME_SECONDS[input.timeframe]);
  const lines: ChartPriceLine[] = [];
  const marks: ChartMarker[] = [];
  const seenLines = new Set<string>();
  const coveredSignals = new Set<string>();

  let running = 0;
  let limits = 0;
  let setupOnly = 0;

  for (const trade of input.runningTrades) {
    if (normalizeSymbol(trade.symbol) !== sym) continue;
    running += 1;
    if (trade.signalId) coveredSignals.add(trade.signalId);
    addTradeOverlay(lines, marks, seenLines, trade, "running", barTime);
  }

  for (const trade of input.limitTrades) {
    if (normalizeSymbol(trade.symbol) !== sym) continue;
    limits += 1;
    if (trade.signalId) coveredSignals.add(trade.signalId);
    addTradeOverlay(lines, marks, seenLines, trade, "limit", barTime);
  }

  for (const setup of input.setups) {
    if (normalizeSymbol(setup.symbol) !== sym) continue;
    if (coveredSignals.has(setup.signalId)) continue;
    setupOnly += 1;
    addSetupOverlay(lines, marks, seenLines, setup, barTime);
    coveredSignals.add(setup.signalId);
  }

  return {
    priceLines: lines,
    markers: marks,
    summary: {
      running,
      limits,
      setups: setupOnly,
      total: running + limits + setupOnly,
    },
  };
}
