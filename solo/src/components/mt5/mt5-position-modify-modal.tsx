"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api, type UserMt5Trade } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MT5_BUY, MT5_SELL, Mt5Pnl, fmtMt5Price } from "@/components/mt5/mt5-ui";

const PERCENT_PRESETS = [25, 50, 75, 100] as const;

type Props = {
  trade: UserMt5Trade | null;
  open: boolean;
  canManage: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

function tradeId(trade: UserMt5Trade) {
  return trade.positionId ?? trade.orderId ?? "";
}

export function Mt5PositionModifyModal({
  trade,
  open,
  canManage,
  onClose,
  onChanged,
}: Props) {
  const [percent, setPercent] = useState(50);
  const [volumeText, setVolumeText] = useState("");
  const [busy, setBusy] = useState<
    "partial" | "close" | "be" | "cancel" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const openVolume = trade?.volume ?? 0;
  const isPending = trade?.kind === "limit";
  const isBuy = trade?.direction.toUpperCase() === "BUY";

  useEffect(() => {
    if (!open || !trade) return;
    setPercent(50);
    setError(null);
    setBusy(null);
    const half = Math.round(openVolume * 50) / 100;
    setVolumeText(half > 0 ? half.toFixed(2) : "");
  }, [open, trade, openVolume]);

  const closeVolume = useMemo(() => {
    const typed = Number(volumeText);
    if (Number.isFinite(typed) && typed > 0) return typed;
    return Number(((openVolume * percent) / 100).toFixed(2));
  }, [volumeText, openVolume, percent]);

  if (!open || !trade) return null;

  const id = tradeId(trade);
  const dirColor = isBuy ? MT5_BUY : MT5_SELL;

  function applyPercent(next: number) {
    setPercent(next);
    setVolumeText(((openVolume * next) / 100).toFixed(2));
  }

  async function run(kind: typeof busy, fn: () => Promise<unknown>) {
    if (!id || !canManage) return;
    setBusy(kind);
    setError(null);
    try {
      await fn();
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-[1] w-full max-w-md rounded-2xl border border-white/10 bg-[#151b2b] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {isPending ? "Pending order" : "Modify position"}
            </p>
            <h2 className="text-lg font-semibold text-white">
              {trade.symbol}{" "}
              <span style={{ color: dirColor }}>
                {trade.direction.toUpperCase()}
              </span>
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              #{id || "—"} · {openVolume.toFixed(2)} lots · entry{" "}
              {fmtMt5Price(trade.openPrice ?? trade.entryMin)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-gray-500">Current</p>
            <p className="font-medium text-white">
              {fmtMt5Price(trade.currentPrice ?? trade.openPrice)}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-gray-500">Profit</p>
            {trade.profit != null ? (
              <Mt5Pnl value={trade.profit} className="text-sm" />
            ) : (
              <p className="text-white">—</p>
            )}
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-gray-500">S / L</p>
            <p className="font-medium text-white">{fmtMt5Price(trade.stopLoss)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-gray-500">T / P</p>
            <p className="font-medium text-white">
              {fmtMt5Price(trade.takeProfit)}
            </p>
          </div>
        </div>

        {!isPending && (
          <div className="mb-4 space-y-2">
            <label className="text-xs text-gray-400">
              Close volume ({percent}% of {openVolume.toFixed(2)})
            </label>
            <div className="flex gap-1">
              {PERCENT_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPercent(p)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                    percent === p
                      ? "bg-primary text-white"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              max={openVolume}
              value={volumeText}
              onChange={(e) => {
                setVolumeText(e.target.value);
                const n = Number(e.target.value);
                if (openVolume > 0 && Number.isFinite(n) && n > 0) {
                  setPercent(Math.min(100, Math.round((n / openVolume) * 100)));
                }
              }}
            />
            <p className="text-[11px] text-gray-500">
              Same as MT5: close part of the lot size. 100% closes the whole
              position.
            </p>
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {!canManage && (
          <p className="mb-3 text-xs text-amber-300">
            Only the soloEmma admin can close or modify live trades.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {isPending ? (
            <Button
              type="button"
              className="w-full bg-[#ff5252] font-semibold text-white hover:bg-[#ff5252]/90"
              disabled={!canManage || busy != null || !id}
              onClick={() =>
                void run("cancel", () => api.signals.closeMt5Position(id))
              }
            >
              {busy === "cancel" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Cancel order
            </Button>
          ) : (
            <>
              <Button
                type="button"
                className="w-full font-semibold"
                disabled={
                  !canManage ||
                  busy != null ||
                  !id ||
                  !Number.isFinite(closeVolume) ||
                  closeVolume <= 0
                }
                onClick={() =>
                  void run("partial", async () => {
                    if (closeVolume >= openVolume - 1e-8) {
                      await api.signals.closeMt5Position(id);
                      return;
                    }
                    await api.signals.partialCloseMt5Position(id, {
                      volume: closeVolume,
                    });
                  })
                }
              >
                {busy === "partial" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {closeVolume >= openVolume - 1e-8
                  ? "Close full position"
                  : `Close ${closeVolume.toFixed(2)} lots (${percent}%)`}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canManage || busy != null || !id}
                  onClick={() =>
                    void run("be", () => api.signals.setMt5PositionBreakeven(id))
                  }
                >
                  {busy === "be" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Set B.E.
                </Button>
                <Button
                  type="button"
                  className="bg-[#ff5252] font-semibold text-white hover:bg-[#ff5252]/90"
                  disabled={!canManage || busy != null || !id}
                  onClick={() =>
                    void run("close", () => api.signals.closeMt5Position(id))
                  }
                >
                  {busy === "close" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Close all
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
