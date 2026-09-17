"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHART_TOOLS_EVENT,
  createAlertId,
  createDrawingId,
  fireChartAlertNotification,
  readChartAlerts,
  readChartDrawings,
  requestChartAlertPermission,
  shouldTriggerAlert,
  alertDirectionLabel,
  type ChartAlertDirection,
  type ChartDrawing,
  type ChartDrawingPoint,
  type ChartPriceAlert,
  type ChartToolMode,
  writeChartAlerts,
  writeChartDrawings,
} from "@/lib/chart-tools";

export type ChartAlertToast = {
  id: string;
  symbol: string;
  message: string;
};

export function useChartTools(symbol: string) {
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [alerts, setAlerts] = useState<ChartPriceAlert[]>([]);
  const [activeTool, setActiveTool] = useState<ChartToolMode>("select");
  const [pendingTrend, setPendingTrend] = useState<ChartDrawingPoint | null>(
    null,
  );
  const [alertToasts, setAlertToasts] = useState<ChartAlertToast[]>([]);
  const lastPriceRef = useRef<Record<string, number>>({});

  const reload = useCallback(() => {
    setDrawings(readChartDrawings(symbol));
    setAlerts(readChartAlerts(symbol));
  }, [symbol]);

  useEffect(() => {
    reload();
    function onStoreChange() {
      reload();
    }
    window.addEventListener(CHART_TOOLS_EVENT, onStoreChange);
    return () => window.removeEventListener(CHART_TOOLS_EVENT, onStoreChange);
  }, [reload]);

  useEffect(() => {
    setPendingTrend(null);
  }, [symbol, activeTool]);

  const persistDrawings = useCallback(
    (nextForSymbol: ChartDrawing[]) => {
      const all = readChartDrawings().filter((d) => d.symbol !== symbol);
      writeChartDrawings([...all, ...nextForSymbol]);
      setDrawings(nextForSymbol);
    },
    [symbol],
  );

  const persistAlerts = useCallback(
    (nextForSymbol: ChartPriceAlert[]) => {
      const all = readChartAlerts().filter((a) => a.symbol !== symbol);
      writeChartAlerts([...all, ...nextForSymbol]);
      setAlerts(nextForSymbol);
    },
    [symbol],
  );

  const addHLine = useCallback(
    (price: number) => {
      const next: ChartDrawing = {
        id: createDrawingId(),
        symbol,
        type: "hline",
        price,
        createdAt: new Date().toISOString(),
      };
      persistDrawings([...drawings, next]);
    },
    [drawings, persistDrawings, symbol],
  );

  const addTrendline = useCallback(
    (p1: ChartDrawingPoint, p2: ChartDrawingPoint) => {
      const next: ChartDrawing = {
        id: createDrawingId(),
        symbol,
        type: "trendline",
        p1,
        p2,
        createdAt: new Date().toISOString(),
      };
      persistDrawings([...drawings, next]);
    },
    [drawings, persistDrawings, symbol],
  );

  const removeDrawing = useCallback(
    (id: string) => {
      persistDrawings(drawings.filter((d) => d.id !== id));
    },
    [drawings, persistDrawings],
  );

  const addAlert = useCallback(
    (price: number, direction: ChartAlertDirection = "cross") => {
      void requestChartAlertPermission();
      const next: ChartPriceAlert = {
        id: createAlertId(),
        symbol,
        price,
        direction,
        triggered: false,
        createdAt: new Date().toISOString(),
      };
      persistAlerts([...alerts, next]);
    },
    [alerts, persistAlerts, symbol],
  );

  const removeAlert = useCallback(
    (id: string) => {
      persistAlerts(alerts.filter((a) => a.id !== id));
    },
    [alerts, persistAlerts],
  );

  const clearTriggeredAlerts = useCallback(() => {
    persistAlerts(alerts.filter((a) => !a.triggered));
  }, [alerts, persistAlerts]);

  const handleChartPoint = useCallback(
    (point: ChartDrawingPoint) => {
      switch (activeTool) {
        case "hline":
          addHLine(point.price);
          setActiveTool("select");
          break;
        case "trendline":
          if (!pendingTrend) {
            setPendingTrend(point);
          } else {
            addTrendline(pendingTrend, point);
            setPendingTrend(null);
            setActiveTool("select");
          }
          break;
        case "alert":
          addAlert(point.price, "cross");
          setActiveTool("select");
          break;
        default:
          break;
      }
    },
    [activeTool, addAlert, addHLine, addTrendline, pendingTrend],
  );

  const cancelTool = useCallback(() => {
    setPendingTrend(null);
    setActiveTool("select");
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      cancelTool();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelTool]);

  const dismissToast = useCallback((id: string) => {
    setAlertToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const checkPriceAlerts = useCallback(
    (sym: string, price: number) => {
      if (!Number.isFinite(price)) return;
      const prev = lastPriceRef.current[sym] ?? null;
      lastPriceRef.current[sym] = price;

      const active = readChartAlerts(sym).filter((a) => !a.triggered);
      if (active.length === 0) return;

      let changed = false;
      const updated = readChartAlerts(sym).map((alert) => {
        if (alert.triggered) return alert;
        if (!shouldTriggerAlert(alert, prev, price)) return alert;
        changed = true;
        fireChartAlertNotification(alert, price);
        const message = `${alertDirectionLabel(alert.direction)} ${alert.price.toFixed(2)}`;
        setAlertToasts((toasts) => [
          ...toasts.slice(-4),
          { id: alert.id, symbol: sym, message },
        ]);
        return {
          ...alert,
          triggered: true,
          triggeredAt: new Date().toISOString(),
        };
      });

      if (changed) {
        const all = readChartAlerts().filter((a) => a.symbol !== sym);
        writeChartAlerts([...all, ...updated]);
        setAlerts(updated);
      }
    },
    [],
  );

  return {
    drawings,
    alerts,
    activeTool,
    setActiveTool,
    pendingTrend,
    setPendingTrend,
    handleChartPoint,
    removeDrawing,
    removeAlert,
    clearTriggeredAlerts,
    alertToasts,
    dismissToast,
    checkPriceAlerts,
    cancelTool,
  };
}
