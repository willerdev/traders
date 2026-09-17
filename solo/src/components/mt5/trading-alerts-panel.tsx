"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Bell, Trash2, X } from "lucide-react";
import {
  alertDirectionLabel,
  type ChartAlertDirection,
  type ChartPriceAlert,
} from "@/lib/chart-tools";
import type { PriceAlertToast } from "@/hooks/use-price-alert-monitor";
import { fmtMt5Price } from "@/components/mt5/mt5-ui";
import { cn } from "@/lib/utils";

type Props = {
  symbol: string;
  lastPrice: number | null;
  linked: boolean;
  alerts: ChartPriceAlert[];
  toasts: PriceAlertToast[];
  onAdd: (
    symbol: string,
    price: number,
    direction: ChartAlertDirection,
  ) => Promise<void>;
  onRemove: (id: string) => void;
  onDismissToast: (id: string) => void;
};

export function TradingAlertsPanel({
  symbol,
  lastPrice,
  linked,
  alerts,
  toasts,
  onAdd,
  onRemove,
  onDismissToast,
}: Props) {
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<ChartAlertDirection>("cross");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...alerts];
    copy.sort((a, b) => {
      if (a.triggered !== b.triggered) return a.triggered ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return copy;
  }, [alerts]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!linked) {
      setError("Connect a MetaAPI account first");
      return;
    }
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a price to watch");
      return;
    }
    setSaving(true);
    try {
      await onAdd(symbol, n, direction);
      setPrice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create alert");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {toasts.length > 0 && (
        <div className="space-y-1.5">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-2 text-xs text-amber-100"
              role="status"
            >
              <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">{toast.symbol}</span>{" "}
                {toast.message}
              </p>
              <button
                type="button"
                className="shrink-0 text-amber-200/80 hover:text-white"
                onClick={() => onDismissToast(toast.id)}
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={(e) => void handleCreate(e)} className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          New alert · {symbol || "Select a pair"}
        </p>
        {lastPrice != null && (
          <p className="text-[11px] text-muted">
            MetaAPI last:{" "}
            <span className="font-semibold text-foreground">
              {fmtMt5Price(lastPrice)}
            </span>
          </p>
        )}
        <input
          type="number"
          step="any"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={lastPrice != null ? String(lastPrice) : "Price"}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              ["cross", "Cross"],
              ["above", "Above"],
              ["below", "Below"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDirection(id)}
              className={cn(
                "rounded-md px-2 py-1.5 text-[11px] font-medium",
                direction === id
                  ? "bg-primary text-white"
                  : "bg-navy/70 text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={saving || !symbol}
          className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create alert"}
        </button>
      </form>

      <ul className="space-y-1.5">
        {sorted.length === 0 ? (
          <li className="px-1 py-6 text-center text-xs text-muted">
            No alerts yet. Set a price and MetaAPI will watch it.
          </li>
        ) : (
          sorted.map((alert) => (
            <li
              key={alert.id}
              className={cn(
                "flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs",
                alert.triggered
                  ? "border border-amber-500/35 bg-amber-500/10"
                  : "bg-navy/70",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{alert.symbol}</p>
                <p className="text-muted">
                  {alertDirectionLabel(alert.direction)} {fmtMt5Price(alert.price)}
                </p>
                {alert.triggered && (
                  <p className="mt-0.5 font-medium text-amber-200">
                    Reached
                    {alert.triggeredAt
                      ? ` · ${new Date(alert.triggeredAt).toLocaleTimeString()}`
                      : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(alert.id)}
                className="shrink-0 text-muted hover:text-danger"
                aria-label="Delete alert"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
