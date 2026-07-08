"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "trp-chart-watchlist";

const DEFAULT_WATCHLIST = [
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "1HZ75V",
  "BTCUSD",
];

function readWatchlist(): string[] {
  if (typeof window === "undefined") return DEFAULT_WATCHLIST;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WATCHLIST;
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WATCHLIST;
    return [...new Set(parsed.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export function useChartWatchlist() {
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);

  useEffect(() => {
    setWatchlist(readWatchlist());
  }, []);

  const persist = useCallback((next: string[]) => {
    setWatchlist(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const addSymbol = useCallback(
    (symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (!sym) return;
      persist([sym, ...watchlist.filter((s) => s !== sym)]);
    },
    [watchlist, persist],
  );

  const removeSymbol = useCallback(
    (symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      persist(watchlist.filter((s) => s !== sym));
    },
    [watchlist, persist],
  );

  return { watchlist, addSymbol, removeSymbol };
}
