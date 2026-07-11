"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { RealtimeQuote } from "@/components/charts/chart-data.service";

const ACTIVE_SYMBOL_MS = 400;
const WATCHLIST_MS = 2000;

function toQuote(item: {
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
}): RealtimeQuote | null {
  if (item.mid == null || !Number.isFinite(item.mid)) return null;
  return {
    bid: item.bid ?? undefined,
    ask: item.ask ?? undefined,
    mid: item.mid,
  };
}

/**
 * Live quotes for the chart — fast poll on the active symbol via mt5/quote
 * (works on production). Batch watchlist uses mt5/quotes/batch when available,
 * otherwise falls back to per-symbol mt5/quote.
 */
export function useChartLiveQuotes(selectedSymbol: string, watchlist: string[]) {
  const [watchlistQuotes, setWatchlistQuotes] = useState<
    Record<string, RealtimeQuote>
  >({});
  const activeQuoteRef = useRef<RealtimeQuote | null>(null);
  const [activeQuote, setActiveQuote] = useState<RealtimeQuote | null>(null);

  const getActiveQuote = useCallback(
    () => activeQuoteRef.current ?? activeQuote,
    [activeQuote],
  );

  useEffect(() => {
    let cancelled = false;

    async function pollActive() {
      try {
        const res = await api.signals.mt5Quote(selectedSymbol);
        const quote = toQuote(res);
        if (cancelled || !quote) return;
        activeQuoteRef.current = quote;
        setActiveQuote(quote);
      } catch {
        /* keep last tick */
      }
    }

    void pollActive();
    const id = window.setInterval(() => void pollActive(), ACTIVE_SYMBOL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selectedSymbol]);

  useEffect(() => {
    const symbols = [...new Set(watchlist.filter((s) => s && s !== selectedSymbol))];
    if (symbols.length === 0) {
      setWatchlistQuotes({});
      return;
    }

    let cancelled = false;
    let batchAvailable = true;

    async function pollFallback() {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await api.signals.mt5Quote(symbol);
            return { symbol, quote: toQuote(res) };
          } catch {
            return { symbol, quote: null };
          }
        }),
      );
      if (cancelled) return;
      setWatchlistQuotes((prev) => {
        const next = { ...prev };
        for (const { symbol, quote } of results) {
          if (quote) next[symbol] = quote;
        }
        return next;
      });
    }

    async function pollBatch() {
      if (!batchAvailable) {
        await pollFallback();
        return;
      }
      try {
        const res = await api.signals.mt5BatchQuotes(symbols);
        if (cancelled) return;
        setWatchlistQuotes((prev) => {
          const next = { ...prev };
          for (const item of res.items) {
            const quote = toQuote(item);
            if (quote) next[item.symbol] = quote;
          }
          return next;
        });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("not found")) batchAvailable = false;
      }
      await pollFallback();
    }

    void pollBatch();
    const id = window.setInterval(() => void pollBatch(), WATCHLIST_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [watchlist, selectedSymbol]);

  const liveQuote = activeQuote;

  return {
    liveQuote,
    getActiveQuote,
    watchlistQuotes,
  };
}
