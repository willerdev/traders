"use client";

import { MT5_BUY, MT5_SELL } from "@/components/mt5/mt5-ui";
import type { Mt5PlaceKind } from "@/lib/mt5-place-kind";

type Props = {
  linked: boolean;
  lotSize: string;
  canTrade?: boolean;
  onLotSizeChange: (value: string) => void;
  onAdjustLot: (delta: number) => void;
  onPlace: (kind: Mt5PlaceKind) => void;
  onNeedConnect: () => void;
};

export function TradingPlaceTradeCard({
  linked,
  lotSize,
  canTrade = false,
  onLotSizeChange,
  onAdjustLot,
  onPlace,
  onNeedConnect,
}: Props) {
  function requireLinked(kind: Mt5PlaceKind) {
    if (!canTrade) return;
    if (!linked) {
      onNeedConnect();
      return;
    }
    onPlace(kind);
  }

  return (
    <div className="shrink-0 rounded-2xl border border-border bg-surface p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Place trade
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => requireLinked("BUY")}
          className="min-w-[4.5rem] rounded-md px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: MT5_BUY }}
          disabled={!canTrade}
        >
          Buy
        </button>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1">
          <button
            type="button"
            onClick={() => onAdjustLot(-0.01)}
            className="flex h-6 w-6 items-center justify-center rounded text-sm font-semibold text-muted hover:bg-navy/60 hover:text-foreground"
            aria-label="Decrease lot size"
          >
            −
          </button>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={lotSize}
            onChange={(e) => onLotSizeChange(e.target.value)}
            className="w-14 bg-transparent text-center text-xs font-semibold tabular-nums text-foreground outline-none"
            aria-label="Lot size"
          />
          <button
            type="button"
            onClick={() => onAdjustLot(0.01)}
            className="flex h-6 w-6 items-center justify-center rounded text-sm font-semibold text-muted hover:bg-navy/60 hover:text-foreground"
            aria-label="Increase lot size"
          >
            +
          </button>
          <span className="pl-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            lot
          </span>
        </div>
        <button
          type="button"
          onClick={() => requireLinked("SELL")}
          className="min-w-[4.5rem] rounded-md px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: MT5_SELL }}
          disabled={!canTrade}
        >
          Sell
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(
          [
            ["BUY_LIMIT", "Buy Limit", MT5_BUY],
            ["SELL_LIMIT", "Sell Limit", MT5_SELL],
            ["BUY_STOP", "Buy Stop", MT5_BUY],
            ["SELL_STOP", "Sell Stop", MT5_SELL],
          ] as const
        ).map(([kind, label, color]) => (
          <button
            key={kind}
            type="button"
            onClick={() => requireLinked(kind)}
            className="rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: color }}
            disabled={!canTrade}
          >
            {label}
          </button>
        ))}
      </div>
      {!canTrade ? (
        <p className="mt-2 text-center text-[11px] text-muted">
          You can view this book. Only the platform admin and assigned traders can place, close, or change trades.
        </p>
      ) : null}
    </div>
  );
}
