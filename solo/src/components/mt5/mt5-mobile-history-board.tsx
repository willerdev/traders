"use client";

import { ArrowUpDown, Clock, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { UserMt5HistoryItem } from "@/lib/api";
import { fmtMt5Date } from "@/components/mt5/mt5-ui";

const BUY = "var(--mt5-blue)";
const SELL = "var(--mt5-red)";
const MUTED = "var(--mt5-muted)";
const TEXT = "var(--mt5-text)";
const LINE = "var(--mt5-divider)";
const PAGE = "var(--mt5-bg)";
const CARD = "var(--mt5-surface)";
const LIFT = "var(--mt5-lift)";

type HistoryTab = "positions" | "orders" | "deals";

type Props = {
  items: UserMt5HistoryItem[];
  loading: boolean;
  error: string | null;
  onChart?: (item: UserMt5HistoryItem) => void;
  onTrade?: (item: UserMt5HistoryItem) => void;
};

function fmtNum(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  const [int, dec] = Math.abs(value).toFixed(digits).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = value < 0 ? "-" : "";
  return dec != null ? `${sign}${grouped}.${dec}` : `${sign}${grouped}`;
}

function fmtPrice(value: number | null | undefined, symbol: string) {
  const digits = /XAU|XAG|BTC|ETH|Volatility|Index/i.test(symbol) ? 2 : 5;
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(Math.min(digits, 5));
}

function instrumentName(symbol: string) {
  const map: Record<string, string> = {
    XAUUSD: "Gold vs US Dollar",
    XAGUSD: "Silver vs US Dollar",
    EURUSD: "Euro vs US Dollar",
    GBPUSD: "Pound vs US Dollar",
    USDJPY: "US Dollar vs Yen",
  };
  if (map[symbol.toUpperCase()]) return map[symbol.toUpperCase()];
  if (/volatility/i.test(symbol)) return symbol;
  return symbol;
}

function pointSize(symbol: string, price: number) {
  if (/XAU|XAG/i.test(symbol)) return 0.01;
  if (/volatility|index/i.test(symbol)) return 0.01;
  if (/JPY/i.test(symbol)) return 0.001;
  if (price >= 100) return 0.01;
  return 0.00001;
}

function PnlText({ value, className }: { value: number; className?: string }) {
  const color = value > 0 ? BUY : value < 0 ? SELL : MUTED;
  return (
    <span className={className} style={{ color }}>
      {fmtNum(value, 2)}
    </span>
  );
}

function friendlyHistoryError(error: string) {
  if (/<!DOCTYPE|<\s*html/i.test(error)) {
    return "Could not refresh trade history. Showing cached trades.";
  }
  return error;
}

export function Mt5MobileHistoryBoard({
  items,
  loading,
  error,
  onChart,
  onTrade,
}: Props) {
  const [tab, setTab] = useState<HistoryTab>("positions");
  const [openId, setOpenId] = useState<string | null>(null);

  const profit = useMemo(
    () => items.reduce((sum, row) => sum + (row.pnl ?? 0), 0),
    [items],
  );
  const swap = useMemo(
    () => items.reduce((sum, row) => sum + (row.swap ?? 0), 0),
    [items],
  );
  const commission = useMemo(
    () => items.reduce((sum, row) => sum + (row.commission ?? 0), 0),
    [items],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      style={{ background: PAGE, color: TEXT }}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: CARD, color: MUTED }}
          aria-label="Sort"
        >
          <ArrowUpDown className="h-4 w-4" />
        </button>
        <div
          className="flex flex-1 items-center rounded-full p-1"
          style={{ background: CARD }}
        >
          {(
            [
              ["positions", "Positions"],
              ["orders", "Orders"],
              ["deals", "Deals"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex-1 rounded-full py-1.5 text-[13px] font-semibold"
              style={{
                background: tab === id ? PAGE : "transparent",
                color: tab === id ? TEXT : MUTED,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: CARD, color: MUTED }}
          aria-label="Calendar"
        >
          <Clock className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <p className="px-4 pb-2 text-[12px]" style={{ color: SELL }}>
          {friendlyHistoryError(error)}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: MUTED }} />
          </div>
        ) : tab === "orders" ? (
          <p className="px-4 py-16 text-center text-[15px]" style={{ color: MUTED }}>
            No orders in history
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-16 text-center text-[15px]" style={{ color: MUTED }}>
            {tab === "deals" ? "No deals" : "No closed positions"}
          </p>
        ) : (
          items.map((row) => (
            <HistoryRow
              key={row.id}
              row={row}
              selected={openId === row.id}
              dealsStyle={tab === "deals"}
              onToggle={() => setOpenId((cur) => (cur === row.id ? null : row.id))}
              onChart={() => onChart?.(row)}
              onTrade={() => onTrade?.(row)}
            />
          ))
        )}

        {tab !== "orders" && items.length > 0 ? (
          <div className="mt-2 px-4 pb-6 text-[15px]" style={{ background: PAGE }}>
            <TotalsRow label="Deposit" value={0} />
            <TotalsRow label="Profit" value={profit} signed />
            <TotalsRow label="Swap" value={swap} />
            <TotalsRow label="Commission" value={commission} />
            <TotalsRow label="Balance" value={profit} signed />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TotalsRow({
  label,
  value,
  signed,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-[3px]">
      <span>{label}</span>
      {signed ? (
        <PnlText value={value} className="tabular-nums" />
      ) : (
        <span className="tabular-nums">{fmtNum(value)}</span>
      )}
    </div>
  );
}

function HistoryRow({
  row,
  selected,
  dealsStyle,
  onToggle,
  onChart,
  onTrade,
}: {
  row: UserMt5HistoryItem;
  selected: boolean;
  dealsStyle: boolean;
  onToggle: () => void;
  onChart: () => void;
  onTrade: () => void;
}) {
  const buy = row.direction.toUpperCase() === "BUY";
  const open = row.entryPrice ?? row.entryMin;
  const close = row.exitPrice ?? row.entryMax;
  const pnl = row.pnl ?? 0;
  const lot = (row.volume ?? 0) > 0 ? row.volume!.toFixed(2) : null;
  const delta = (close ?? 0) - (open ?? 0);
  const pts = pointSize(row.symbol, open ?? close ?? 0);
  const points = pts > 0 ? delta / pts : 0;
  const pct = open ? (delta / open) * 100 : 0;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-2.5 text-left"
        style={{ background: CARD, borderBottom: `1px solid ${LINE}` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-[16px] font-semibold">{row.symbol}</span>
              <span
                className="text-[15px] font-medium"
                style={{ color: buy ? BUY : SELL }}
              >
                {row.direction.toLowerCase()}
                {lot ? ` ${lot}` : ""}
                {dealsStyle ? " deal" : ""}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] tabular-nums" style={{ color: MUTED }}>
              {fmtPrice(open, row.symbol)} → {fmtPrice(close, row.symbol)}
            </p>
          </div>
          <div className="text-right">
            <PnlText value={pnl} className="text-[16px] font-medium tabular-nums" />
            <p className="mt-0.5 text-[12px] tabular-nums" style={{ color: MUTED }}>
              {fmtMt5Date(row.closedAt)}
            </p>
          </div>
        </div>
      </button>

      {selected ? (
        <div className="px-2 pb-3 pt-2">
          <div
            className="overflow-hidden rounded-[14px] shadow-sm"
            style={{ background: LIFT }}
          >
            <button type="button" onClick={onToggle} className="w-full px-4 py-3 text-left">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-[16px] font-semibold">{row.symbol}</span>
                    <span
                      className="text-[15px] font-medium"
                      style={{ color: buy ? BUY : SELL }}
                    >
                      {row.direction.toLowerCase()}
                      {lot ? ` ${lot}` : ""}
                    </span>
                  </div>
                  <p className="text-[13px]" style={{ color: MUTED }}>
                    {instrumentName(row.symbol)}
                  </p>
                </div>
                <span className="text-[12px] tabular-nums" style={{ color: MUTED }}>
                  #{row.signalId || row.id}
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-[15px] tabular-nums" style={{ color: MUTED }}>
                  {fmtPrice(open, row.symbol)} → {fmtPrice(close, row.symbol)}
                </p>
                <PnlText value={pnl} className="text-[22px] font-medium tabular-nums" />
              </div>
              <p
                className="mt-1 text-[13px] tabular-nums"
                style={{ color: points < 0 ? SELL : points > 0 ? BUY : MUTED }}
              >
                Δ = {points >= 0 ? "" : "−"}
                {fmtNum(Math.abs(points), 0)} ({pct >= 0 ? "" : "−"}
                {Math.abs(pct).toFixed(2)}%) {points < 0 ? "▾" : points > 0 ? "▴" : ""}
              </p>
              <p className="mt-1 text-[13px] tabular-nums" style={{ color: MUTED }}>
                {fmtMt5Date(row.submittedAt)} → {fmtMt5Date(row.closedAt)}
              </p>
              <div
                className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]"
                style={{ color: MUTED }}
              >
                <span>
                  S/L:{" "}
                  <span className="tabular-nums" style={{ color: TEXT }}>
                    {row.stopLoss ? fmtPrice(row.stopLoss, row.symbol) : "—"}
                  </span>
                </span>
                <span className="text-right">
                  Swap:{" "}
                  <span className="tabular-nums" style={{ color: TEXT }}>
                    {row.swap != null && row.swap !== 0 ? fmtNum(row.swap) : "—"}
                  </span>
                </span>
                <span>
                  T/P:{" "}
                  <span className="tabular-nums" style={{ color: TEXT }}>
                    {row.takeProfit ? fmtPrice(row.takeProfit, row.symbol) : "—"}
                  </span>
                </span>
                <span className="text-right">
                  Charges:{" "}
                  <span className="tabular-nums" style={{ color: TEXT }}>
                    {row.commission != null && row.commission !== 0
                      ? fmtNum(row.commission)
                      : "—"}
                  </span>
                </span>
              </div>
              {row.comment ? (
                <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
                  {row.comment}
                </p>
              ) : null}
            </button>
            <div className="border-t text-center text-[17px]" style={{ borderColor: LINE }}>
              <button
                type="button"
                onClick={onChart}
                className="w-full py-3 font-medium"
                style={{ color: BUY, borderBottom: `1px solid ${LINE}` }}
              >
                Chart
              </button>
              <button
                type="button"
                onClick={onTrade}
                className="w-full py-3 font-medium"
                style={{ color: BUY }}
              >
                Trade
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
