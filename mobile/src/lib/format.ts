import type { DisplayCurrencyInfo } from "./types";

export type DisplayCurrency = DisplayCurrencyInfo;

export function isLocalCurrencyDisplay(
  display?: DisplayCurrency | null,
): boolean {
  const code = display?.code?.toUpperCase() || "USDT";
  return Boolean(
    display &&
      code !== "USDT" &&
      display.source !== "fallback" &&
      display.rate != null &&
      Number.isFinite(display.rate) &&
      display.rate > 0,
  );
}

export function formatMoney(
  amountUsdt: number | null | undefined,
  display?: DisplayCurrency | null,
): string {
  if (amountUsdt == null || Number.isNaN(amountUsdt)) return "—";
  const code = display?.code?.toUpperCase() || "USDT";
  const rate = display?.rate;
  const useLocal = isLocalCurrencyDisplay(display);

  if (!useLocal) {
    return `${amountUsdt.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDT`;
  }

  const local = amountUsdt * (rate as number);
  const maxFrac = (rate as number) >= 100 ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFrac,
    }).format(local);
  } catch {
    const rounded =
      maxFrac === 0 ? Math.round(local) : Math.round(local * 100) / 100;
    return `${rounded.toLocaleString()} ${code}`;
  }
}

export function formatUsdt(value: number | null | undefined): string {
  return formatMoney(value, null);
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function truncateMiddle(value: string, start = 8, end = 6): string {
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}
