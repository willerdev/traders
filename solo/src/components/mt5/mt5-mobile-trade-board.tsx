"use client";

import { CreditCard, MoreHorizontal, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { UserMt5AccountSummary, UserMt5Trade } from "@/lib/api";
import { fmtMt5Date } from "@/components/mt5/mt5-ui";

const BUY = "var(--mt5-blue)";
const SELL = "var(--mt5-red)";
const MUTED = "var(--mt5-muted)";
const TEXT = "var(--mt5-text)";
const LINE = "var(--mt5-divider)";
const PAGE = "var(--mt5-bg)";
const CARD = "var(--mt5-surface)";
const LIFT = "var(--mt5-lift)";

type Props = {
  trades: UserMt5Trade[];
  account?: UserMt5AccountSummary | null;
  canTrade: boolean;
  onModify: (trade: UserMt5Trade) => void;
  onClose: (trade: UserMt5Trade) => void;
  onChart?: (symbol: string) => void;
  onTrade?: (symbol: string) => void;
  onNewOrder?: () => void;
  onBulk?: () => void;
};

function tradeKey(trade: UserMt5Trade) {
  return (
    trade.positionId ?? trade.orderId ?? `${trade.symbol}-${trade.openPrice}`
  );
}

function isBuy(trade: UserMt5Trade) {
  return trade.direction.toUpperCase() === "BUY";
}

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

function fmtNum(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  const [int, dec] = Math.abs(value).toFixed(digits).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = value < 0 ? "-" : "";
  return dec != null ? `${sign}${grouped}.${dec}` : `${sign}${grouped}`;
}

function fmtPrice(value: number | null | undefined, symbol: string) {
  const digits = /XAU|XAG|BTC|ETH/i.test(symbol) ? 2 : 5;
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function instrumentName(symbol: string) {
  const map: Record<string, string> = {
    XAUUSD: "Gold vs US Dollar",
    XAGUSD: "Silver vs US Dollar",
    EURUSD: "Euro vs US Dollar",
    GBPUSD: "Pound vs US Dollar",
    USDJPY: "US Dollar vs Yen",
    USDCHF: "US Dollar vs Swiss Franc",
    AUDUSD: "Australian Dollar vs US Dollar",
    USDCAD: "US Dollar vs Canadian Dollar",
    NZDUSD: "New Zealand Dollar vs US Dollar",
    BTCUSD: "Bitcoin vs US Dollar",
    ETHUSD: "Ethereum vs US Dollar",
  };
  return map[symbol.toUpperCase()] ?? symbol;
}

function pointSize(symbol: string, price: number) {
  if (/XAU|XAG/i.test(symbol)) return 0.01;
  if (/JPY/i.test(symbol)) return 0.001;
  if (/BTC|ETH/i.test(symbol)) return 1;
  if (price >= 100) return 0.01;
  return 0.00001;
}

function PnlText({
  value,
  className,
  suffix,
}: {
  value: number;
  className?: string;
  suffix?: string;
}) {
  const color = value > 0 ? BUY : value < 0 ? SELL : MUTED;
  const text = `${value > 0 ? "" : ""}${fmtNum(value, 2)}${suffix ? ` ${suffix}` : ""}`;
  return (
    <span className={className} style={{ color }}>
      {text}
    </span>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-1.5"
      style={{ background: PAGE, color: MUTED }}
    >
      <span className="text-[13px] font-semibold">{label}</span>
      <MoreHorizontal className="h-4 w-4" />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-[5px] text-[15px]"
      style={{ color: TEXT }}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function Mt5MobileTradeBoard({
  trades,
  account,
  canTrade,
  onModify,
  onClose,
  onChart,
  onTrade,
  onNewOrder,
  onBulk,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const currency = account?.currency || "USD";
  const floating = account?.floatingProfit ?? 0;
  const balance = account?.startingBalance ?? 0;
  const equity = account?.equity ?? balance;
  const margin = account?.margin ?? 0;
  const freeMargin =
    account?.freeMargin ??
    (margin > 0 ? Math.max(0, equity - margin) : equity);
  const marginLevel = margin > 0 ? (equity / margin) * 100 : 0;

  const positions = useMemo(
    () => trades.filter((t) => t.kind !== "limit"),
    [trades],
  );
  const orders = useMemo(
    () => trades.filter((t) => t.kind === "limit"),
    [trades],
  );

  function toggle(trade: UserMt5Trade) {
    const key = tradeKey(trade);
    setOpenKey((cur) => (cur === key ? null : key));
  }

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      style={{ background: PAGE, color: TEXT }}
    >
      <div className="relative flex shrink-0 items-center px-3 py-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: CARD, color: MUTED }}
          aria-label="Account"
        >
          <CreditCard className="h-4 w-4" />
        </button>
        <div className="absolute inset-x-16 text-center">
          <PnlText
            value={floating}
            suffix={currency}
            className="text-[22px] font-medium leading-tight"
          />
        </div>
        <button
          type="button"
          onClick={onNewOrder}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: CARD, color: MUTED }}
          aria-label="New order"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div style={{ background: CARD }}>
          <StatRow label="Balance:" value={fmtNum(balance)} />
          <StatRow label="Equity:" value={fmtNum(equity)} />
          <StatRow label="Margin:" value={fmtNum(margin)} />
          <StatRow label="Free Margin:" value={fmtNum(freeMargin)} />
          <StatRow
            label="Margin Level (%):"
            value={margin > 0 ? fmtNum(marginLevel) : "—"}
          />
        </div>

        {positions.length === 0 && orders.length === 0 ? (
          <p className="px-4 py-16 text-center text-[15px]" style={{ color: MUTED }}>
            No positions or orders
          </p>
        ) : null}

        {positions.length > 0 ? (
          <>
            <SectionHead label="Positions" />
            {positions.map((trade) => (
              <PositionBlock
                key={tradeKey(trade)}
                trade={trade}
                selected={openKey === tradeKey(trade)}
                canTrade={canTrade}
                currency={currency}
                onToggle={() => toggle(trade)}
                onModify={() => onModify(trade)}
                onClose={() => onClose(trade)}
                onChart={() => onChart?.(trade.symbol)}
                onTrade={() => onTrade?.(trade.symbol)}
                onBulk={onBulk}
              />
            ))}
          </>
        ) : null}

        {orders.length > 0 ? (
          <>
            <SectionHead label="Orders" />
            {orders.map((trade) => (
              <OrderBlock
                key={tradeKey(trade)}
                trade={trade}
                selected={openKey === tradeKey(trade)}
                canTrade={canTrade}
                onToggle={() => toggle(trade)}
                onModify={() => onModify(trade)}
                onClose={() => onClose(trade)}
                onChart={() => onChart?.(trade.symbol)}
                onTrade={() => onTrade?.(trade.symbol)}
              />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function PositionBlock({
  trade,
  selected,
  canTrade,
  currency,
  onToggle,
  onModify,
  onClose,
  onChart,
  onTrade,
  onBulk,
}: {
  trade: UserMt5Trade;
  selected: boolean;
  canTrade: boolean;
  currency: string;
  onToggle: () => void;
  onModify: () => void;
  onClose: () => void;
  onChart: () => void;
  onTrade: () => void;
  onBulk?: () => void;
}) {
  const buy = isBuy(trade);
  const open = trade.openPrice ?? trade.entryMin;
  const now = trade.currentPrice ?? open;
  const pnl = trade.profit ?? 0;
  const lot = trade.volume?.toFixed(2) ?? "—";
  const ticket = trade.positionId ?? trade.orderId ?? "";
  const delta = (now ?? 0) - (open ?? 0);
  const pts = pointSize(trade.symbol, open ?? now ?? 0);
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
              <span className="text-[16px] font-semibold">{trade.symbol}</span>
              <span
                className="text-[15px] font-medium"
                style={{ color: buy ? BUY : SELL }}
              >
                {typeLabel(trade)} {lot}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] tabular-nums" style={{ color: MUTED }}>
              {fmtPrice(open, trade.symbol)} → {fmtPrice(now, trade.symbol)}
            </p>
          </div>
          <PnlText value={pnl} className="text-[18px] font-medium tabular-nums" />
        </div>
      </button>

      {selected ? (
        <div className="px-2 pb-3 pt-2">
          <div
            className="overflow-hidden rounded-[14px] shadow-sm"
            style={{ background: LIFT }}
          >
            <button
              type="button"
              onClick={onToggle}
              className="w-full px-4 py-3 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-[16px] font-semibold">
                      {trade.symbol}
                    </span>
                    <span
                      className="text-[15px] font-medium"
                      style={{ color: buy ? BUY : SELL }}
                    >
                      {typeLabel(trade)} {lot}
                    </span>
                  </div>
                  <p className="text-[13px]" style={{ color: MUTED }}>
                    {instrumentName(trade.symbol)}
                  </p>
                </div>
                <span className="text-[12px] tabular-nums" style={{ color: MUTED }}>
                  #{ticket || "—"}
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-[15px] tabular-nums" style={{ color: MUTED }}>
                  {fmtPrice(open, trade.symbol)} → {fmtPrice(now, trade.symbol)}
                </p>
                <PnlText
                  value={pnl}
                  className="text-[22px] font-medium tabular-nums"
                />
              </div>
              <p
                className="mt-1 text-[13px] tabular-nums"
                style={{ color: points < 0 ? SELL : points > 0 ? BUY : MUTED }}
              >
                Δ = {points >= 0 ? "" : "−"}
                {fmtNum(Math.abs(points), 0)} ({pct >= 0 ? "" : "−"}
                {Math.abs(pct).toFixed(2)}%){" "}
                <span>{points < 0 ? "▾" : points > 0 ? "▴" : ""}</span>
              </p>
              <div
                className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]"
                style={{ color: MUTED }}
              >
                <span>
                  S/L:{" "}
                  <span className="tabular-nums" style={{ color: TEXT }}>
                    {fmtPrice(trade.stopLoss, trade.symbol)}
                  </span>
                </span>
                <span className="text-right">
                  Swap:{" "}
                  <span className="tabular-nums" style={{ color: TEXT }}>
                    {fmtNum(trade.swap ?? 0)}
                  </span>
                </span>
                <span>
                  T/P:{" "}
                  <span className="tabular-nums" style={{ color: TEXT }}>
                    {fmtPrice(trade.takeProfit, trade.symbol)}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {trade.submittedAt ? fmtMt5Date(trade.submittedAt) : "—"}
                </span>
              </div>
              {trade.comment ? (
                <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
                  {trade.comment}
                </p>
              ) : null}
            </button>
            {canTrade ? (
              <div className="border-t text-center text-[17px]" style={{ borderColor: LINE }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 font-medium"
                  style={{ color: SELL, borderBottom: `1px solid ${LINE}` }}
                >
                  Close position
                </button>
                <button
                  type="button"
                  onClick={onModify}
                  className="w-full py-3 font-medium"
                  style={{ color: BUY, borderBottom: `1px solid ${LINE}` }}
                >
                  Modify position
                </button>
                <button
                  type="button"
                  onClick={onTrade}
                  className="w-full py-3 font-medium"
                  style={{ color: BUY, borderBottom: `1px solid ${LINE}` }}
                >
                  Trade
                </button>
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
                  onClick={onBulk}
                  disabled={!onBulk}
                  className="w-full py-3 font-medium disabled:opacity-40"
                  style={{ color: BUY }}
                >
                  Bulk Operations...
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderBlock({
  trade,
  selected,
  canTrade,
  onToggle,
  onModify,
  onClose,
  onChart,
  onTrade,
}: {
  trade: UserMt5Trade;
  selected: boolean;
  canTrade: boolean;
  onToggle: () => void;
  onModify: () => void;
  onClose: () => void;
  onChart: () => void;
  onTrade: () => void;
}) {
  const buy = isBuy(trade);
  const remaining = trade.volume ?? 0;
  const initial = trade.initialVolume ?? remaining;
  const filled = Math.max(0, initial - remaining);
  const price = trade.openPrice ?? trade.entryMin;

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
              <span className="text-[16px] font-semibold">{trade.symbol}</span>
              <span
                className="text-[15px] font-medium"
                style={{ color: buy ? BUY : SELL }}
              >
                {typeLabel(trade)}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] tabular-nums" style={{ color: MUTED }}>
              {remaining.toFixed(2)} / {fmtNum(filled, filled % 1 === 0 ? 0 : 2)}{" "}
              at {fmtPrice(price, trade.symbol)}
            </p>
          </div>
          <span className="text-[15px] font-medium" style={{ color: BUY }}>
            placed
          </span>
        </div>
      </button>
      {selected && canTrade ? (
        <div className="px-2 pb-3 pt-2">
          <div
            className="overflow-hidden rounded-[14px] text-center text-[17px] shadow-sm"
            style={{ background: LIFT }}
          >
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 font-medium"
              style={{ color: SELL, borderBottom: `1px solid ${LINE}` }}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={onModify}
              className="w-full py-3 font-medium"
              style={{ color: BUY, borderBottom: `1px solid ${LINE}` }}
            >
              Modify
            </button>
            <button
              type="button"
              onClick={onTrade}
              className="w-full py-3 font-medium"
              style={{ color: BUY, borderBottom: `1px solid ${LINE}` }}
            >
              Trade
            </button>
            <button
              type="button"
              onClick={onChart}
              className="w-full py-3 font-medium"
              style={{ color: BUY }}
            >
              Chart
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
