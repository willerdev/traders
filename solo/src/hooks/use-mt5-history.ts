"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type UserMt5HistoryItem } from "@/lib/api";
import {
  readMt5HistoryCache,
  writeMt5HistoryCache,
} from "@/lib/mt5-history-cache";
import { useMetaApiLive } from "@/hooks/use-metaapi-live";
import { isAfterSoloMt5HistoryReset } from "@/lib/solo-mt5-history-since";

const POLL_MS = 45_000;
const HISTORY_LIMIT = 80;


export function useMt5History(userId: string | undefined, linked: boolean) {
  const { live } = useMetaApiLive();
  const [items, setItems] = useState<UserMt5HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const cached = readMt5HistoryCache(userId);
    if (cached) {
      setItems(
        cached.items.filter((row) => isAfterSoloMt5HistoryReset(row.closedAt)),
      );
    }
  }, [userId]);

  const load = useCallback(
    async (opts?: { fresh?: boolean }) => {
      if (!userId || !linked) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.signals.mt5History(opts?.fresh, 7);
        if (res.message && res.items.length === 0) {
          setError(res.message);
          return;
        }
        const next = res.items.filter((row) =>
          isAfterSoloMt5HistoryReset(row.closedAt),
        );
        setItems(next);
        writeMt5HistoryCache(userId, next);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load trade history",
        );
      } finally {
        setLoading(false);
      }
    },
    [userId, linked],
  );

  useEffect(() => {
    if (!linked || !userId) return;
    void load({ fresh: false });
    if (!live) return;
    const id = window.setInterval(() => void load({ fresh: false }), POLL_MS);
    return () => window.clearInterval(id);
  }, [linked, userId, live, load]);

  const todaysItems = useMemo(
    () => items.filter((row) => isAfterSoloMt5HistoryReset(row.closedAt)),
    [items],
  );

  const visibleItems = useMemo(
    () => todaysItems.slice(0, HISTORY_LIMIT),
    [todaysItems],
  );

  const dayPnl = useMemo(
    () => todaysItems.reduce((sum, row) => sum + (row.pnl ?? 0), 0),
    [todaysItems],
  );

  return {
    items: visibleItems,
    loading,
    error,
    load,
    dayPnl,
    dealCount: todaysItems.length,
  };
}
