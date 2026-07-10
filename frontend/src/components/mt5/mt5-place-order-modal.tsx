"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api, type Mt5MarketOrderPreview } from "@/lib/api";
import { computeOneToOneTakeProfit } from "@/lib/mt5-order-stops";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MT5_BUY, MT5_SELL, fmtMt5Price } from "@/components/mt5/mt5-ui";
import { cn } from "@/lib/utils";

type Direction = "BUY" | "SELL";

type Props = {
  symbol: string;
  direction: Direction;
  open: boolean;
  onClose: () => void;
  onPlaced?: () => void;
};

export function Mt5PlaceOrderModal({
  symbol,
  direction,
  open,
  onClose,
  onPlaced,
}: Props) {
  const [preview, setPreview] = useState<Mt5MarketOrderPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [tpManual, setTpManual] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.signals.mt5OrderPreview(symbol, direction);
      setPreview(next);
      setStopLoss(String(next.stopLoss));
      setTakeProfit(String(next.takeProfit));
      setTpManual(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load order preview");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, direction]);

  useEffect(() => {
    if (!open) return;
    void loadPreview();
  }, [open, loadPreview]);

  function handleStopLossChange(value: string) {
    setStopLoss(value);
    if (tpManual || !preview) return;
    const entry = preview.entry;
    const sl = Number(value);
    if (!Number.isFinite(sl) || sl <= 0) return;
    const tp = computeOneToOneTakeProfit(direction, entry, sl);
    setTakeProfit(String(Number(tp.toFixed(5))));
  }

  async function handleSubmit() {
    const sl = Number(stopLoss);
    const tp = Number(takeProfit);
    if (!Number.isFinite(sl) || !Number.isFinite(tp)) {
      setError("Enter valid stop loss and take profit levels");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.signals.placeMt5Order({
        symbol,
        direction,
        stopLoss: sl,
        takeProfit: tp,
      });
      onPlaced?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const isBuy = direction === "BUY";

  return (
    <div
      className="modal-overlay fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mt5-place-order-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-white/10 bg-[#1a1d24] p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="mt5-place-order-title"
              className="text-lg font-semibold text-white"
            >
              {isBuy ? "Buy" : "Sell"} {symbol}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Market order · SL &amp; TP default to 1:1 RR from entry
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && !preview ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading quote…</span>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  Entry (market)
                </p>
                <p className="mt-0.5 font-semibold tabular-nums text-white">
                  {preview ? fmtMt5Price(preview.entry) : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  Volume
                </p>
                <p className="mt-0.5 font-semibold tabular-nums text-white">
                  {preview?.risk.volume ?? "—"} lot
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs text-gray-400">
                Stop loss
                {preview?.defaultSlPips != null && (
                  <span className="ml-1 text-gray-500">
                    (default {preview.defaultSlPips} pips)
                  </span>
                )}
                <Input
                  type="number"
                  step="any"
                  value={stopLoss}
                  onChange={(e) => handleStopLossChange(e.target.value)}
                  className="mt-1 border-white/10 bg-black/30 text-white"
                />
              </label>
              <label className="block text-xs text-gray-400">
                Take profit (1:1 RR)
                <Input
                  type="number"
                  step="any"
                  value={takeProfit}
                  onChange={(e) => {
                    setTpManual(true);
                    setTakeProfit(e.target.value);
                  }}
                  className="mt-1 border-white/10 bg-black/30 text-white"
                />
              </label>
            </div>

            {preview && (
              <p className="mt-3 text-[11px] text-gray-500">
                Risk ~{fmtMt5Price(preview.risk.riskAmount)}{" "}
                {preview.risk.currency} ({preview.risk.riskPercent}% equity)
              </p>
            )}
          </>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 font-semibold text-white"
            style={{ backgroundColor: isBuy ? MT5_BUY : MT5_SELL }}
            onClick={() => void handleSubmit()}
            disabled={submitting || loading || !preview}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Placing…
              </>
            ) : (
              `Place ${isBuy ? "Buy" : "Sell"}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
