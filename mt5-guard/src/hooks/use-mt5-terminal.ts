import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../stores/auth";
import { useAppActive } from "./use-app-active-polling";
import type {
  UserMt5QuotesResult,
  UserMt5RunningResult,
  UserMt5Terminal,
} from "../lib/types";

export type Mt5ScreenMode = "chart" | "trades" | "history";

export function useMt5Terminal(mode: Mt5ScreenMode, enabled: boolean, focused: boolean) {
  const { api } = useAuth();
  const [terminal, setTerminal] = useState<UserMt5Terminal | null>(null);
  const [running, setRunning] = useState<UserMt5RunningResult | null>(null);
  const [quotes, setQuotes] = useState<UserMt5QuotesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = enabled && focused;

  const loadTerminal = useCallback(
    async (background = false) => {
      if (!enabled) return;
      if (!background) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const data = await api.signals.mt5Terminal();
        setTerminal(data);
      } catch (err) {
        if (!background) {
          setError(err instanceof Error ? err.message : "Could not load MT5");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, enabled],
  );

  const loadRunning = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await api.signals.mt5Running();
      setRunning(data);
      setTerminal((prev) =>
        prev
          ? {
              ...prev,
              account: data.account ?? prev.account,
              accountSource: data.accountSource ?? prev.accountSource,
              stats: {
                ...prev.stats,
                runningCount: data.stats.runningCount,
                floatingProfit: data.stats.floatingProfit,
              },
            }
          : prev,
      );
    } catch {
      /* keep snapshot */
    }
  }, [api, enabled]);

  const loadQuotes = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await api.signals.mt5Quotes();
      setQuotes(data);
    } catch {
      /* keep snapshot */
    }
  }, [api, enabled]);

  useEffect(() => {
    if (enabled && focused) void loadTerminal();
  }, [enabled, focused, loadTerminal]);

  useAppActive(
    () => void loadRunning(),
    active && (mode === "trades" || mode === "chart"),
    800,
  );

  useAppActive(
    () => void loadQuotes(),
    active && mode === "chart",
    800,
  );

  useAppActive(
    () => void loadTerminal(true),
    active && (mode === "chart" || mode === "trades"),
    4000,
  );

  return {
    terminal,
    running,
    quotes,
    loading,
    refreshing,
    error,
    reload: () => void loadTerminal(true),
    reloadRunning: loadRunning,
  };
}
