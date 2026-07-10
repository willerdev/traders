"use client";

import { type ReactNode, useState } from "react";
import {
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Mt5AccountMode } from "@/lib/mt5-account-mode";
import type { UserMt5AccountSource, UserMt5InvestorSummary } from "@/lib/api";

/* MT5 palette — blue wins/buy, red losses/sell in both themes */
export const MT5_BUY = "#4a9eff";
export const MT5_SELL = "#ff5252";

export function fmtMt5Pnl(value: number) {
  const n = value >= 0 ? value : value;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtMt5Price(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  const [int, dec] = value.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped}.${dec}`;
}

export function fmtMt5Date(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}.${mo}.${day} ${h}:${min}:${s}`;
}

export function directionColor(direction: string) {
  return direction.toUpperCase() === "BUY" ? MT5_BUY : MT5_SELL;
}

export function pnlColor(value: number) {
  return value >= 0 ? MT5_BUY : MT5_SELL;
}

export function Mt5SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex border-b border-[var(--mt5-divider)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "relative flex-1 py-2.5 text-[11px] font-semibold tracking-wide transition-colors",
            active === t.id
              ? "text-[var(--mt5-text)]"
              : "text-[var(--mt5-muted)]",
          )}
        >
          {t.label}
          {active === t.id && (
            <span
              className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
              style={{ backgroundColor: MT5_BUY }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

export function Mt5SummaryBlock({
  rows,
  className,
}: {
  rows: { label: string; value: string; color?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-1 border-b border-[var(--mt5-divider)] px-4 py-3", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline gap-1 text-sm">
          <span className="shrink-0 text-[var(--mt5-muted)]">{row.label}</span>
          <span
            className="min-w-0 flex-1 overflow-hidden border-b border-dotted border-[var(--mt5-divider)]"
            aria-hidden
          />
          <span
            className="shrink-0 font-medium tabular-nums"
            style={row.color ? { color: row.color } : { color: "var(--mt5-text)" }}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Mt5DirectionTag({
  direction,
  volume,
  suffix,
}: {
  direction: string;
  volume?: number | null;
  suffix?: string;
}) {
  const isBuy = direction.toUpperCase() === "BUY";
  const label = [
    isBuy ? "buy" : "sell",
    volume != null ? volume.toFixed(2) : null,
    suffix,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className="text-sm font-normal"
      style={{ color: isBuy ? MT5_BUY : MT5_SELL }}
    >
      {label}
    </span>
  );
}

export function Mt5Pnl({
  value,
  className,
  showSign = false,
}: {
  value: number;
  className?: string;
  showSign?: boolean;
}) {
  const prefix = showSign && value > 0 ? "+" : "";
  return (
    <span
      className={cn("font-semibold tabular-nums", className)}
      style={{ color: pnlColor(value) }}
    >
      {prefix}
      {fmtMt5Pnl(value)}
    </span>
  );
}

export function Mt5Divider() {
  return <div className="h-px bg-[var(--mt5-divider)]" />;
}

export function Mt5DetailGrid({
  left,
  right,
}: {
  left: { label: string; value: string }[];
  right: { label: string; value: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
      <div className="space-y-2">
        {left.map((row) => (
          <div key={row.label}>
            <span className="text-[var(--mt5-muted)]">{row.label}</span>{" "}
            <span className="text-[var(--mt5-text)] tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {right.map((row) => (
          <div key={row.label}>
            <span className="text-[var(--mt5-muted)]">{row.label}</span>{" "}
            <span className="text-[var(--mt5-text)] tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Mt5ActionStrip({
  actions,
}: {
  actions: {
    key: string;
    label: string;
    onClick: () => void;
    variant?: "buy" | "sell" | "neutral";
    loading?: boolean;
    disabled?: boolean;
  }[];
}) {
  if (actions.length === 0) return null;
  return (
    <div className="flex border-t border-[var(--mt5-divider)]">
      {actions.map((action, i) => (
        <button
          key={action.key}
          type="button"
          disabled={action.disabled || action.loading}
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold uppercase tracking-wide transition-colors disabled:opacity-40",
            i > 0 && "border-l border-[var(--mt5-divider)]",
            action.variant === "sell" && "text-[#ff5252] hover:bg-[#ff5252]/10",
            action.variant === "buy" && "text-[#4a9eff] hover:bg-[#4a9eff]/10",
            action.variant !== "sell" &&
              action.variant !== "buy" &&
              "text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)]",
          )}
        >
          {action.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function Mt5ExpandableRow({
  id,
  expanded,
  onToggle,
  header,
  subheader,
  trailing,
  children,
  actions,
}: {
  id: string;
  expanded: boolean;
  onToggle: () => void;
  header: ReactNode;
  subheader?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="bg-[var(--mt5-bg)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--mt5-row-hover)] active:bg-[var(--mt5-row-hover)]"
        aria-expanded={expanded}
        aria-controls={`mt5-detail-${id}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">{header}</div>
          {subheader && (
            <div className="mt-1 text-sm text-[var(--mt5-muted)]">{subheader}</div>
          )}
        </div>
        {trailing}
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-[var(--mt5-muted)] transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div id={`mt5-detail-${id}`}>
          {children}
          {actions}
        </div>
      )}
      <Mt5Divider />
    </div>
  );
}

export function useMt5Expand() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return {
    expandedId,
    toggle: (id: string) =>
      setExpandedId((prev) => (prev === id ? null : id)),
    isExpanded: (id: string) => expandedId === id,
  };
}

export function Mt5Empty({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="px-4 py-16 text-center">
      <p className="text-sm text-[var(--mt5-muted)]">{title}</p>
      {hint && (
        <p className="mt-1 text-xs text-[var(--mt5-muted)] opacity-70">{hint}</p>
      )}
    </div>
  );
}

export function Mt5AccountModeBadge({
  mode,
  detail,
  className,
}: {
  mode: Mt5AccountMode;
  detail?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        mode === "real"
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-amber-500/15 text-amber-300",
        className,
      )}
    >
      {mode === "real" ? "Real" : "Demo"}
      {detail ? (
        <span className="font-normal normal-case tracking-normal text-white/70">
          · {detail}
        </span>
      ) : null}
    </span>
  );
}

export function Mt5AccountSummary({
  account,
  investor,
  accountSource,
}: {
  account: {
    startingBalance: number;
    currency: string;
    realizedProfit: number;
    floatingProfit: number;
    totalProfit: number;
    equity: number;
  };
  investor?: UserMt5InvestorSummary;
  accountSource?: UserMt5AccountSource;
}) {
  const liveBroker =
    accountSource === "copy_live" ||
    accountSource === "linked_live" ||
    accountSource === "investor_live";
  const rows = [
    ...(investor && investor.investmentDeposited > 0
      ? [
          {
            label: "Investment",
            value: formatCurrency(investor.investmentDeposited),
          },
        ]
      : []),
    ...(investor?.mt5Balance != null
      ? [
          {
            label: "MT5 balance",
            value: `${fmtMt5Price(investor.mt5Balance)} ${investor.currency}`,
          },
        ]
      : []),
    {
      label: liveBroker ? "Live balance" : "Balance",
      value: fmtMt5Price(
        liveBroker
          ? account.startingBalance
          : account.startingBalance + account.realizedProfit,
      ),
    },
    {
      label: "Profit",
      value: `${account.totalProfit >= 0 ? "+" : ""}${fmtMt5Price(account.totalProfit)}`,
      color: pnlColor(account.totalProfit),
    },
    {
      label: "Floating",
      value: `${account.floatingProfit >= 0 ? "+" : ""}${fmtMt5Price(account.floatingProfit)}`,
      color: pnlColor(account.floatingProfit),
    },
    {
      label: "Equity",
      value: fmtMt5Price(account.equity),
    },
  ];

  return <Mt5SummaryBlock rows={rows} />;
}

export function Mt5FloatingHeader({
  account,
}: {
  account: {
    totalProfit: number;
    currency: string;
    equity: number;
  };
}) {
  return (
    <div className="border-b border-[var(--mt5-divider)] px-4 py-3 text-center">
      <p className="text-xs text-[var(--mt5-muted)]">Account P/L</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">
        <Mt5Pnl value={account.totalProfit} showSign />
        <span className="ml-1 text-sm font-normal text-[var(--mt5-muted)]">
          {account.currency}
        </span>
      </p>
      <p className="mt-1 text-xs text-[var(--mt5-muted)]">
        Equity {fmtMt5Price(account.equity)} {account.currency}
      </p>
    </div>
  );
}

export function fmtCurrencyMt5(value: number) {
  return formatCurrency(value).replace("$", "");
}

export function fmtQuoteTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** MT5-style bid/ask with emphasized trailing digits */
export function Mt5QuotePrice({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[var(--mt5-muted)]">—</span>;
  const raw = value.toFixed(value >= 100 ? 2 : value >= 1 ? 3 : 5);
  const [intPart, decPart] = raw.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (!decPart || decPart.length <= 2) {
    return (
      <span className="font-semibold tabular-nums text-[var(--mt5-text)]">
        {grouped}.{decPart ?? "00"}
      </span>
    );
  }
  const main = decPart.slice(0, -1);
  const last = decPart.slice(-1);
  return (
    <span className="tabular-nums text-[var(--mt5-text)]">
      <span className="text-base font-medium">
        {grouped}.{main}
      </span>
      <span className="text-xl font-bold">{last}</span>
    </span>
  );
}

export function rowKey(
  parts: (string | null | undefined)[],
  index: number,
) {
  return parts.find(Boolean) ?? `row-${index}`;
}
