import type { OpenSetupItem, UserMt5Trade } from "@/lib/api";
import type { ChartMarker, ChartPriceLine, ChartTimeframe } from "@/components/charts/chart-types";
import { MT5_BUY, MT5_SELL, fmtMt5Price } from "@/components/mt5/mt5-ui";

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

function tradeDirection(trade: UserMt5Trade): "BUY" | "SELL" {
  return trade.direction.toUpperCase() === "BUY" ? "BUY" : "SELL";
}

function tradeMeta(trade: UserMt5Trade): Pick<
  ChartPriceLine,
  | "signalId"
  | "positionId"
  | "orderId"
  | "direction"
  | "entryMin"
  | "entryMax"
  | "openPrice"
> {
  return {
    signalId: trade.signalId,
    positionId: trade.positionId,
    orderId: trade.orderId,
    direction: tradeDirection(trade),
    entryMin: trade.entryMin,
    entryMax: trade.entryMax,
    openPrice: trade.openPrice,
  };
}

function canDragTradeStops(trade: UserMt5Trade): boolean {
  return trade.canAdjustStops !== false;
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
  const meta = tradeMeta(trade);
  const draggable = canDragTradeStops(trade);

  if (trade.stopLoss != null) {
    pushLine(lines, seenLines, {
      id: `${id}-sl`,
      price: trade.stopLoss,
      color: MT5_SELL,
      title: `SL · ${fmtMt5Price(trade.stopLoss)}`,
      lineStyle: 2,
      kind: "sl",
      draggable,
      ...meta,
    });
  }
  if (trade.takeProfit != null) {
    pushLine(lines, seenLines, {
      id: `${id}-tp`,
      price: trade.takeProfit,
      color: MT5_BUY,
      title: `TP · ${fmtMt5Price(trade.takeProfit)}`,
      lineStyle: 2,
      kind: "tp",
      draggable,
      ...meta,
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
      title:
        kind === "limit"
          ? `Limit · ${fmtMt5Price(entry)}`
          : `Entry · ${fmtMt5Price(entry)}`,
      lineStyle: kind === "limit" ? 2 : 0,
      kind: kind === "limit" ? "limit" : "entry",
      draggable: false,
      ...meta,
    });
  }

  marks.push({
    time: barTime,
    position: isBuy ? "belowBar" : "aboveBar",
    color: dirColor,
    shape: isBuy ? "arrowUp" : "arrowDown",
    text: kind === "limit" ? "Limit" : "Entry",
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
  const direction: "BUY" | "SELL" = isBuy ? "BUY" : "SELL";
  const baseMeta = {
    signalId: setup.signalId,
    positionId: lt?.positionId,
    orderId: lt?.orderId,
    direction,
    entryMin: setup.entryMin,
    entryMax: setup.entryMax,
    openPrice: lt?.openPrice ?? lt?.entryPrice,
  };
  const liveDraggable =
    lt?.status === "open" || lt?.status === "pending";

  const sl = lt?.stopLoss ?? setup.stopLoss;
  const tp = lt?.takeProfit ?? setup.takeProfit;

  if (sl != null) {
    pushLine(lines, seenLines, {
      id: `${id}-sl`,
      price: sl,
      color: MT5_SELL,
      title: `SL · ${fmtMt5Price(sl)}`,
      lineStyle: 2,
      kind: "sl",
      draggable: liveDraggable,
      ...baseMeta,
    });
  }
  if (tp != null) {
    pushLine(lines, seenLines, {
      id: `${id}-tp`,
      price: tp,
      color: MT5_BUY,
      title: `TP · ${fmtMt5Price(tp)}`,
      lineStyle: 2,
      kind: "tp",
      draggable: liveDraggable,
      ...baseMeta,
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
        title: `Entry · ${fmtMt5Price(entry)}`,
        lineStyle: 0,
        kind: "entry",
        draggable: false,
        ...baseMeta,
      });
    }
    marks.push({
      time: barTime,
      position: isBuy ? "belowBar" : "aboveBar",
      color: dirColor,
      shape: isBuy ? "arrowUp" : "arrowDown",
      text: "Entry",
    });
    return;
  }

  const limitPrice = lt?.openPrice ?? lt?.entryPrice;
  if (lt?.status === "pending" && limitPrice != null) {
    pushLine(lines, seenLines, {
      id: `${id}-limit`,
      price: limitPrice,
      color: dirColor,
      title: `Limit · ${fmtMt5Price(limitPrice)}`,
      lineStyle: 2,
      kind: "limit",
      draggable: false,
      ...baseMeta,
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
    title: `Entry · ${fmtMt5Price(setup.entryMin)}`,
    lineStyle: 2,
    kind: "entry",
    draggable: false,
    ...baseMeta,
  });
  if (setup.entryMax !== setup.entryMin) {
    pushLine(lines, seenLines, {
      id: `${id}-entry-max`,
      price: setup.entryMax,
      color: dirColor,
      title: `Entry · ${fmtMt5Price(setup.entryMax)}`,
      lineStyle: 2,
      kind: "entry",
      draggable: false,
      ...baseMeta,
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

export type Mt5ChartOverlayOptions = {
  showOrders?: boolean;
  showLimits?: boolean;
  showSlTp?: boolean;
};

export function buildMt5ChartOverlays(input: {
  selectedSymbol: string;
  timeframe: ChartTimeframe;
  runningTrades: UserMt5Trade[];
  limitTrades: UserMt5Trade[];
  setups: OpenSetupItem[];
  options?: Mt5ChartOverlayOptions;
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

  const showOrders = input.options?.showOrders !== false;
  const showLimits = input.options?.showLimits !== false;
  const showSlTp = input.options?.showSlTp !== false;

  if (showOrders) {
    for (const trade of input.runningTrades) {
      if (normalizeSymbol(trade.symbol) !== sym) continue;
      running += 1;
      if (trade.signalId) coveredSignals.add(trade.signalId);
      addTradeOverlay(lines, marks, seenLines, trade, "running", barTime);
    }
  }

  if (showLimits) {
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
  }

  const filteredLines = showSlTp
    ? lines
    : lines.filter((l) => l.kind !== "sl" && l.kind !== "tp");

  return {
    priceLines: filteredLines.map((l) =>
      showSlTp ? l : { ...l, draggable: false },
    ),
    markers: marks,
    summary: {
      running,
      limits,
      setups: setupOnly,
      total: running + limits + setupOnly,
    },
  };
}
