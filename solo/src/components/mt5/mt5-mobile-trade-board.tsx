"use client";

import type { UserMt5AccountSummary, UserMt5Trade } from "@/lib/api";
import {
  MT5_BUY,
  MT5_SELL,
  Mt5Pnl,
  fmtMt5Price,
} from "@/components/mt5/mt5-ui";
import { Mt5SwipeableRow } from "@/components/mt5/mt5-swipeable-row";

type Props = {
  trades: UserMt5Trade[];
  account?: UserMt5AccountSummary | null;
  canTrade: boolean;
  onModify: (trade: UserMt5Trade) => void;
  onClose: (trade: UserMt5Trade) => void;
};

function typeLabel(trade: UserMt5Trade) {
  const dir = trade.direction.toLowerCase();
  if (trade.kind === "limit") {
    const order = (trade.orderType || "").toLowerCase();
    if (order.includes("stop")) return `${dir} stop`;
    if (order.includes("limit")) return `${dir} limit`;
    return `${dir} pending`;
  }
  return dir;
}

export function Mt5MobileTradeBoard({
  trades,
  account,
  canTrade,
  onModify,
  onClose,
}: Props) {
  const floating = account?.floatingProfit ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--mt5-bg)] text-[var(--mt5-text)]">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm text-[var(--mt5-muted)]">
              No running trades
            </p>
            <p className="mt-1 text-xs text-[var(--mt5-muted)]">
              Open a market, limit, or stop order below.
            </p>
          </div>
        ) : (
          trades.map((trade) => {
            const ticket = trade.positionId ?? trade.orderId ?? "";
            const pending = trade.kind === "limit";
            const pnl = trade.profit ?? 0;
            return (
              <Mt5SwipeableRow
                key={ticket || `${trade.symbol}-${trade.openPrice}`}
                className="border-b border-[var(--mt5-divider)]"
                actions={
                  canTrade
                    ? [
                        {
                          key: "modify",
                          label: "Modify",
                          tone: "primary",
                          onClick: () => onModify(trade),
                        },
                        {
                          key: "close",
                          label: pending ? "Cancel" : "Close",
                          tone: "danger",
                          onClick: () => onClose(trade),
                        },
                      ]
                    : []
                }
              >
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left"
                  onClick={() => onModify(trade)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-[15px] font-semibold tracking-wide">
                          {trade.symbol}
                        </span>
                        <span
                          className="text-[13px] font-medium"
                          style={{
                            color:
                              trade.direction.toUpperCase() === "BUY"
                                ? MT5_BUY
                                : MT5_SELL,
                          }}
                        >
                          {typeLabel(trade)} {trade.volume?.toFixed(2) ?? ""}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-[var(--mt5-muted)]">
                        #{ticket || "—"}
                        {trade.comment ? ` · ${trade.comment}` : ""}
                      </p>
                    </div>
                    <Mt5Pnl
                      value={pnl}
                      className="text-[15px]"
                      showSign
                    />
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px] tabular-nums text-[var(--mt5-muted)]">
                    <span>
                      Open{" "}
                      <span className="text-[var(--mt5-text)]">
                        {fmtMt5Price(trade.openPrice ?? trade.entryMin)}
                      </span>
                    </span>
                    <span>
                      Now{" "}
                      <span className="text-[var(--mt5-text)]">
                        {fmtMt5Price(trade.currentPrice ?? trade.openPrice)}
                      </span>
                    </span>
                    <span className="text-right">
                      SL {fmtMt5Price(trade.stopLoss)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-right text-[11px] tabular-nums text-[var(--mt5-muted)]">
                    TP {fmtMt5Price(trade.takeProfit)}
                  </div>
                </button>
              </Mt5SwipeableRow>
            );
          })
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-3 py-2 text-[11px] text-[var(--mt5-muted)]">
        <span>
          Bal{" "}
          <strong className="font-semibold text-[var(--mt5-text)]">
            {fmtMt5Price(account?.startingBalance ?? 0)}
          </strong>
        </span>
        <span>
          Eq{" "}
          <strong className="font-semibold text-[var(--mt5-text)]">
            {fmtMt5Price(account?.equity ?? account?.startingBalance ?? 0)}
          </strong>
        </span>
        <span className="ml-auto">
          Float{" "}
          <Mt5Pnl value={floating} className="inline text-[11px]" showSign />
        </span>
      </div>
    </div>
  );
}
