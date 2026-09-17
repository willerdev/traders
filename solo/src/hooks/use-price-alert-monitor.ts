"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useMetaApiLive } from "@/hooks/use-metaapi-live";
import {
  CHART_TOOLS_EVENT,
  addChartAlert,
  alertDirectionLabel,
  markChartAlertsTriggered,
  readChartAlerts,
  removeChartAlert,
  requestChartAlertPermission,
  shouldTriggerAlert,
  type ChartAlertDirection,
  type ChartPriceAlert,
} from "@/lib/chart-tools";

const POLL_MS = 8000;
const MAX_SYMBOLS = 6;

export type PriceAlertToast = {
  id: string;
  symbol: string;
  message: string;
};

export function usePriceAlertMonitor(enabled: boolean) {
  const { live } = useMetaApiLive();
  const polling = enabled && live;
  const [alerts, setAlerts] = useState<ChartPriceAlert[]>([]);
  const [toasts, setToasts] = useState<PriceAlertToast[]>([]);
  const [lastPrices, setLastPrices] = useState<Record<string, number>>({});
  const lastPriceRef = useRef<Record<string, number>>({});
  const pendingCount = alerts.filter((a) => !a.triggered).length;

  const reload = useCallback(() => {
    setAlerts(readChartAlerts());
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(CHART_TOOLS_EVENT, reload);
    return () => window.removeEventListener(CHART_TOOLS_EVENT, reload);
  }, [reload]);

  const addAlert = useCallback(
    async (
      symbol: string,
      price: number,
      direction: ChartAlertDirection = "cross",
    ) => {
      if (!symbol.trim() || !Number.isFinite(price) || price <= 0) {
        throw new Error("Enter a valid price");
      }
      await requestChartAlertPermission();
      addChartAlert({ symbol, price, direction });
    },
    [],
  );

  const removeAlert = useCallback((id: string) => {
    removeChartAlert(id);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!polling) return;

    let cancelled = false;

    async function tick() {
      const pending = readChartAlerts().filter((a) => !a.triggered);
      const symbols = [
        ...new Set(pending.map((a) => a.symbol).filter(Boolean)),
      ].slice(0, MAX_SYMBOLS);
      if (symbols.length === 0) return;

      const hits: Array<{ id: string; price: number; alert: ChartPriceAlert }> =
        [];

      for (const symbol of symbols) {
        if (cancelled) return;
        try {
          const res = await api.signals.mt5Quote(symbol);
          const price = res.mid ?? ((res.bid ?? 0) + (res.ask ?? 0)) / 2;
          if (!Number.isFinite(price) || price <= 0) continue;
          const prev = lastPriceRef.current[symbol] ?? null;
          lastPriceRef.current[symbol] = price;
          setLastPrices((prev) =>
            prev[symbol] === price ? prev : { ...prev, [symbol]: price },
          );
          for (const alert of pending.filter((a) => a.symbol === symbol)) {
            if (shouldTriggerAlert(alert, prev, price)) {
              hits.push({ id: alert.id, price, alert });
            }
          }
        } catch {
          /* keep watching */
        }
      }

      if (cancelled || hits.length === 0) return;
      markChartAlertsTriggered(hits.map(({ id, price }) => ({ id, price })));
      setToasts((prev) => [
        ...prev.slice(-4),
        ...hits.map(({ alert, price }) => ({
          id: `${alert.id}-${Date.now()}`,
          symbol: alert.symbol,
          message: `${alertDirectionLabel(alert.direction)} ${alert.price} (now ${price})`,
        })),
      ]);
    }

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [polling, pendingCount]);

  return {
    alerts,
    addAlert,
    removeAlert,
    toasts,
    dismissToast,
    lastPrices,
  };
}
