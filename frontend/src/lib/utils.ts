import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type DisplayCurrency = {
  code: string;
  rate: number | null;
  source?: "coinbase" | "fallback";
  preferredCurrency?: string | null;
  derivedFromCountry?: string | null;
};

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

/** Legacy USDT/USD formatter (ledger amounts). */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

const CURRENCY_LOCALES: Record<string, string> = {
  RWF: "en-RW",
  UGX: "en-UG",
  KES: "en-KE",
  TZS: "en-TZ",
  NGN: "en-NG",
  GHS: "en-GH",
  ZAR: "en-ZA",
  EUR: "en-EU",
  GBP: "en-GB",
  USD: "en-US",
};

/**
 * Format a USDT ledger amount in the user's display currency.
 * Falls back to USDT when rate is missing or code is USDT.
 */
export function formatMoney(
  amountUsdt: number,
  display?: DisplayCurrency | null,
): string {
  const code = display?.code?.toUpperCase() || "USDT";
  const rate = display?.rate;
  const useLocal = isLocalCurrencyDisplay(display);

  if (!useLocal) {
    return `${formatCurrency(amountUsdt)} USDT`;
  }

  const local = amountUsdt * (rate as number);
  const maxFrac = (rate as number) >= 100 ? 0 : 2;
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALES[code] ?? "en", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFrac,
    }).format(local);
  } catch {
    const rounded =
      maxFrac === 0 ? Math.round(local) : Math.round(local * 100) / 100;
    return `${code} ${rounded.toLocaleString("en-US")}`;
  }
}

/** Secondary USDT line when showing local currency. */
export function formatUsdtHint(
  amountUsdt: number,
  display?: DisplayCurrency | null,
): string | null {
  const code = display?.code?.toUpperCase() || "USDT";
  if (
    !display ||
    code === "USDT" ||
    display.source === "fallback" ||
    display.rate == null
  ) {
    return null;
  }
  return `≈ ${formatCurrency(amountUsdt)} USDT`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export const TIER_COLORS: Record<string, string> = {
  BRONZE: "text-amber-700",
  SILVER: "text-gray-300",
  GOLD: "text-rank-gold",
  DIAMOND: "text-cyan-400",
  ELITE: "text-purple-400",
};

export const TIER_BG: Record<string, string> = {
  BRONZE: "bg-amber-700/20 border-amber-700/40",
  SILVER: "bg-gray-400/20 border-gray-400/40",
  GOLD: "bg-rank-gold/20 border-rank-gold/40",
  DIAMOND: "bg-cyan-400/20 border-cyan-400/40",
  ELITE: "bg-purple-400/20 border-purple-400/40",
};
