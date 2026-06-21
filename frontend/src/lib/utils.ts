import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
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
