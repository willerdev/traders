"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type UserMt5HistoryItem } from "@/lib/api";
import {
  readMt5HistoryCache,
  writeMt5HistoryCache,
} from "@/lib/mt5-history-cache";
import { useMetaApiLive } from "@/hooks/use-metaapi-live";

const POLL_MS = 45_000;
const HISTORY_LIMIT = 10;

function isLocalToday(iso: string) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return false;
  const now = new Date();
  return (
    t.getFullYear() === now.getFullYear() &&
    t.getMonth() === now.getMonth() &&
    t.getDate() === now.getDate()
  );
}

export function useMt5History(userId: string | undefined, linked: boolean) {
  const { live } = useMetaApiLive();
  const [items, setItems] = useState<UserMt5HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const cached = readMt5HistoryCache(userId);
    if (cached) setItems(cached.items);
  }, [userId]);

  const load = useCallback(
    async (_opts?: { fresh?: boolean }) => {
      if (!userId || !linked) return;
      setLoading(true);
      setError(null);
      try {
        const terminal = await api.signals.mt5Terminal();
        const next = terminal.history?.items ?? [];
        if (next.length === 0) {
          const cached = readMt5HistoryCache(userId);
          if (cached && cached.items.length > 0) {
            setItems(cached.items);
            return;
          }
        }
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
    () => items.filter((row) => isLocalToday(row.closedAt)),
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
