"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type UserMt5QuoteItem, type UserMt5Terminal, type UserMt5Trade } from "@/lib/api";
import {
  patchMt5RunningCache,
  readMt5Cache,
  runningFromTerminal,
  writeMt5Cache,
} from "@/lib/mt5-cache";
import { useMetaApiLive } from "@/hooks/use-metaapi-live";

const RUNNING_POLL_MS = 1200;
const QUOTES_POLL_MS = 4000;
const TERMINAL_POLL_MS = 8000;

type Tab = "quotes" | "chart" | "trades" | "history" | "setups";

function bootstrapFromCache(userId: string | undefined) {
  if (!userId) return null;
  return readMt5Cache(userId);
}

export function useMt5Terminal(
  userId: string | undefined,
  isAuthenticated: boolean,
  hasHydrated: boolean,
  tab: Tab,
  accessGranted = true,
) {
  const { live } = useMetaApiLive();
  const [data, setData] = useState<UserMt5Terminal | null>(null);
  const [runningTrades, setRunningTrades] = useState<UserMt5Trade[]>([]);
  const [quotes, setQuotes] = useState<UserMt5QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<UserMt5Terminal | null>(null);
  const cacheHydratedRef = useRef(false);
  const runningInFlight = useRef(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!userId || cacheHydratedRef.current) return;
    const cached = bootstrapFromCache(userId);
    if (!cached) return;
    cacheHydratedRef.current = true;
    const timer = window.setTimeout(() => {
      setData(cached.terminal);
      setRunningTrades(cached.runningTrades);
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  const persist = useCallback(
    (terminal: UserMt5Terminal, running: UserMt5Trade[]) => {
      if (!userId) return;
      writeMt5Cache(userId, terminal, running);
    },
    [userId],
  );

  const load = useCallback(
    async (opts?: { background?: boolean }) => {
      const hasSnapshot = Boolean(dataRef.current);
      const background = opts?.background ?? hasSnapshot;

      if (!background) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      if (!background) setError(null);

      try {
        const terminal = await api.signals.mt5Terminal();
        const running = runningFromTerminal(terminal);
        setData(terminal);
        setRunningTrades(running);
        persist(terminal, running);
      } catch (err) {
        if (!hasSnapshot) {
          setError(err instanceof Error ? err.message : "Could not load MT5 data");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [persist],
  );

  const loadRunning = useCallback(async () => {
    if (runningInFlight.current) return;
    runningInFlight.current = true;
    try {
      const res = await api.signals.mt5Running();
      const running = res.trades;
      setRunningTrades(running);
      setData((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          trades: [
            ...prev.trades.filter((t) => t.kind !== "running"),
            ...running,
          ],
          account: res.account ?? prev.account,
          stats: {
            ...prev.stats,
            runningCount: res.stats.runningCount,
            floatingProfit: res.stats.floatingProfit,
          },
        };
        if (userId) {
          patchMt5RunningCache(userId, running, next.stats, res.account);
        }
        return next;
      });
    } catch {
      /* keep frozen snapshot on poll errors */
    } finally {
      runningInFlight.current = false;
    }
  }, [userId]);

  const canLoad = isAuthenticated && accessGranted;

  useEffect(() => {
    if (!hasHydrated || !canLoad || !userId) return;
    const cached = readMt5Cache(userId);
    const timer = window.setTimeout(() => {
      void load({ background: Boolean(cached) });
    }, 0);
    const slowTimer = window.setTimeout(() => {
      if (!dataRef.current) {
        setError(
          "MT5 is taking longer than usual — the server may be waking up. Pull to refresh or wait a moment.",
        );
        setLoading(false);
      }
    }, 12000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(slowTimer);
    };
  }, [hasHydrated, canLoad, userId, load]);

  const loadQuotes = useCallback(async () => {
    try {
      const res = await api.signals.mt5Quotes();
      setQuotes(res.items);
    } catch {
      /* keep last quotes on poll errors */
    }
  }, []);

  useEffect(() => {
    if (!canLoad || !live || (tab !== "trades" && tab !== "chart")) return;
    const start = window.setTimeout(() => {
      void loadRunning();
    }, 0);
    const id = window.setInterval(() => void loadRunning(), RUNNING_POLL_MS);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [canLoad, live, tab, loadRunning]);

  useEffect(() => {
    if (!canLoad || !live || (tab !== "quotes" && tab !== "chart")) return;
    const start = window.setTimeout(() => {
      void loadQuotes();
    }, 4000);
    const id = window.setInterval(() => void loadQuotes(), QUOTES_POLL_MS);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [canLoad, live, tab, loadQuotes]);

  useEffect(() => {
    if (!canLoad || !live || tab !== "chart") return;
    const id = window.setInterval(() => void load({ background: true }), TERMINAL_POLL_MS);
    return () => window.clearInterval(id);
  }, [canLoad, live, tab, load]);

  return {
    data,
    runningTrades,
    quotes,
    loading,
    refreshing,
    error,
    setError,
    load,
    loadRunning,
    loadQuotes,
  };
}
