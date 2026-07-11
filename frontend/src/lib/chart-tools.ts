/** Client-side chart drawings and price alerts (localStorage). */

export type ChartToolMode =
  | "select"
  | "hline"
  | "trendline"
  | "alert"
  | "erase";

export type ChartDrawingPoint = {
  time: number;
  price: number;
};

export type ChartDrawing =
  | {
      id: string;
      symbol: string;
      type: "hline";
      price: number;
      createdAt: string;
    }
  | {
      id: string;
      symbol: string;
      type: "trendline";
      p1: ChartDrawingPoint;
      p2: ChartDrawingPoint;
      createdAt: string;
    };

export type ChartAlertDirection = "cross" | "above" | "below";

export type ChartPriceAlert = {
  id: string;
  symbol: string;
  price: number;
  direction: ChartAlertDirection;
  note?: string;
  triggered: boolean;
  triggeredAt?: string;
  createdAt: string;
};

type ChartToolsStore = {
  drawings: ChartDrawing[];
  alerts: ChartPriceAlert[];
};

const STORAGE_KEY = "mt5-chart-tools-v1";
export const CHART_TOOLS_EVENT = "mt5-chart-tools-change";

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readStore(): ChartToolsStore {
  if (!canUseStorage()) return { drawings: [], alerts: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { drawings: [], alerts: [] };
    const parsed = JSON.parse(raw) as Partial<ChartToolsStore>;
    return {
      drawings: Array.isArray(parsed.drawings) ? parsed.drawings : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
    };
  } catch {
    return { drawings: [], alerts: [] };
  }
}

function writeStore(store: ChartToolsStore) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(CHART_TOOLS_EVENT, { detail: store }));
}

export function readChartDrawings(symbol?: string): ChartDrawing[] {
  const { drawings } = readStore();
  if (!symbol) return drawings;
  return drawings.filter((d) => d.symbol === symbol);
}

export function readChartAlerts(symbol?: string): ChartPriceAlert[] {
  const { alerts } = readStore();
  if (!symbol) return alerts;
  return alerts.filter((a) => a.symbol === symbol);
}

export function writeChartDrawings(drawings: ChartDrawing[]) {
  const store = readStore();
  writeStore({ ...store, drawings });
}

export function writeChartAlerts(alerts: ChartPriceAlert[]) {
  const store = readStore();
  writeStore({ ...store, alerts });
}

export function createDrawingId() {
  return `draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAlertId() {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function alertDirectionLabel(direction: ChartAlertDirection): string {
  switch (direction) {
    case "above":
      return "Crosses above";
    case "below":
      return "Crosses below";
    default:
      return "Crosses";
  }
}

/** Distance from point (px) to a segment in screen space. */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function shouldTriggerAlert(
  alert: ChartPriceAlert,
  prevPrice: number | null,
  nextPrice: number,
): boolean {
  if (alert.triggered) return false;
  const level = alert.price;
  if (prevPrice == null || !Number.isFinite(prevPrice)) return false;

  switch (alert.direction) {
    case "above":
      return prevPrice < level && nextPrice >= level;
    case "below":
      return prevPrice > level && nextPrice <= level;
    case "cross":
      return (
        (prevPrice < level && nextPrice >= level) ||
        (prevPrice > level && nextPrice <= level)
      );
    default:
      return false;
  }
}

export async function requestChartAlertPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function fireChartAlertNotification(
  alert: ChartPriceAlert,
  price: number,
): void {
  const title = `${alert.symbol} price alert`;
  const body = `${alertDirectionLabel(alert.direction)} ${alert.price.toFixed(2)} (now ${price.toFixed(2)})`;

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, { body, tag: alert.id });
    } catch {
      /* ignore */
    }
  }
}
