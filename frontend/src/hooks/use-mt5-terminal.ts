"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type UserMt5Terminal, type UserMt5Trade } from "@/lib/api";
import {
  patchMt5RunningCache,
  readMt5Cache,
  runningFromTerminal,
  writeMt5Cache,
} from "@/lib/mt5-cache";

type Tab = "setups" | "trades" | "history";

function bootstrapFromCache(userId: string | undefined) {
  if (!userId) return null;
  return readMt5Cache(userId);
}

export function useMt5Terminal(
  userId: string | undefined,
  isAuthenticated: boolean,
  hasHydrated: boolean,
  tab: Tab,
) {
  const [data, setData] = useState<UserMt5Terminal | null>(null);
  const [runningTrades, setRunningTrades] = useState<UserMt5Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<UserMt5Terminal | null>(null);
  const cacheHydratedRef = useRef(false);

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
    try {
      const res = await api.signals.mt5Running();
      setRunningTrades(res.trades);
      setData((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          account: res.account ?? prev.account,
          stats: {
            ...prev.stats,
            runningCount: res.stats.runningCount,
            floatingProfit: res.stats.floatingProfit,
          },
        };
        if (userId) {
          patchMt5RunningCache(
            userId,
            res.trades,
            res.stats,
            res.account,
          );
        }
        return next;
      });
    } catch {
      /* keep frozen snapshot on poll errors */
    }
  }, [userId]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !userId) return;
    const cached = readMt5Cache(userId);
    const timer = window.setTimeout(() => {
      void load({ background: Boolean(cached) });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hasHydrated, isAuthenticated, userId, load]);

  useEffect(() => {
    if (!isAuthenticated || tab !== "trades") return;
    const start = window.setTimeout(() => {
      void loadRunning();
    }, 0);
    const id = window.setInterval(() => void loadRunning(), 2000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [isAuthenticated, tab, loadRunning]);

  return {
    data,
    runningTrades,
    loading,
    refreshing,
    error,
    setError,
    load,
    loadRunning,
  };
}
