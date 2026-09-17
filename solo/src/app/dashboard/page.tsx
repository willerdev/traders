"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type UserMt5Trade } from "@/lib/api";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { useAuthStore, syncApiAuthToken } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import {
  PerformanceDashboard,
  type ApiReadiness,
} from "@/components/dashboard/performance-dashboard";

export default function DashboardPage() {
  const { ready } = useRequireAuth();
  const user = useAuthStore((s) => s.user);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deposited, setDeposited] = useState(0);
  const [withdrawn, setWithdrawn] = useState(0);
  const [earned, setEarned] = useState(0);
  const [available, setAvailable] = useState(0);
  const [dailyNets, setDailyNets] = useState<Array<{ date: string; net: number }>>(
    [],
  );
  const [running, setRunning] = useState<UserMt5Trade[]>([]);
  const [floating, setFloating] = useState(0);
  const [dayPnl, setDayPnl] = useState(0);
  const [apiReady, setApiReady] = useState<ApiReadiness>({
    platform: false,
    metaApi: false,
    metaApiAccount: false,
    deriv: false,
  });

  useEffect(() => {
    if (!ready) return;
    const token = syncApiAuthToken();
    if (!token) return;

    let cancelled = false;
    setLoading(true);
    const now = new Date();

    Promise.allSettled([
      api.wallet.summary(),
      api.wallet.dailyCalendar(now.getUTCFullYear(), now.getUTCMonth() + 1),
      api.signals.mt5Running(),
      api.signals.mt5History(false, 2),
      api.metaApi.status(),
      api.deriv.status(),
    ]).then((results) => {
      if (cancelled) return;
      const [wallet, calendar, runningRes, history, meta, deriv] = results;
      const readyState: ApiReadiness = {
        platform: wallet.status === "fulfilled",
        metaApi: false,
        metaApiAccount: false,
        deriv: false,
      };

      if (wallet.status === "fulfilled") {
        setDeposited(wallet.value.totalDeposited);
        setWithdrawn(wallet.value.totalWithdrawn);
        setEarned(wallet.value.totalEarned);
        setAvailable(wallet.value.availableBalance);
      }
      if (calendar.status === "fulfilled") {
        const nets = (calendar.value.summary?.dailyNets ?? []).map((d) => ({
          date: d.date,
          net: d.net,
        }));
        if (nets.length === 0) {
          const days = Object.values(calendar.value.days).sort((a, b) =>
            a.date.localeCompare(b.date),
          );
          setDailyNets(days.map((d) => ({ date: d.date, net: d.net })));
        } else {
          setDailyNets(nets);
        }
      }
      if (runningRes.status === "fulfilled") {
        setRunning(
          runningRes.value.trades.filter((t) => t.kind === "running"),
        );
        setFloating(runningRes.value.stats.floatingProfit);
      }
      if (history.status === "fulfilled") {
        setDayPnl(history.value.dayPnl ?? 0);
      }
      if (meta.status === "fulfilled") {
        readyState.metaApi = meta.value.connected;
        readyState.metaApiAccount = Boolean(meta.value.accountId);
      }
      if (deriv.status === "fulfilled") {
        readyState.deriv = deriv.value.connected;
      }
      setApiReady(readyState);
      const failed = results.every((r) => r.status === "rejected");
      setError(failed ? "Could not load dashboard" : "");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [ready]);

  const name = useMemo(
    () => user?.displayName?.trim() || user?.email || "Account",
    [user?.displayName, user?.email],
  );

  if (!ready) return <AuthLoadingScreen />;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-base font-semibold text-white">Could not load dashboard</p>
        <Button size="sm" className="mt-5" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <PerformanceDashboard
        displayName={name}
        email={user?.email}
        avatarUrl={user?.avatarUrl}
        deposited={deposited}
        withdrawn={withdrawn}
        earned={earned}
        available={available}
        dailyNets={dailyNets}
        running={running}
        floating={floating}
        dayPnl={dayPnl}
        apiReady={apiReady}
      />
    </div>
  );
}
