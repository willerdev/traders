"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthStore, useDashboardStore, syncApiAuthToken } from "@/stores/auth";
import { api, type UserMt5Trade } from "@/lib/api";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { Button } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { DashboardAnnouncement } from "@/components/dashboard/dashboard-announcement";
import { WithdrawPolicyAgreeModal } from "@/components/dashboard/withdraw-policy-agree-modal";
import { InvestmentHome } from "@/components/dashboard/investment-home";
import {
  PerformanceDashboard,
  type ApiReadiness,
} from "@/components/dashboard/performance-dashboard";

function DashboardBody() {
  const { data, loading, error, fetchDashboard } = useDashboardStore();
  const user = useAuthStore((s) => s.user);
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
  const [perfLoading, setPerfLoading] = useState(true);

  async function handleRegistrationComplete() {
    await fetchDashboard();
    const fresh = useDashboardStore.getState().data;
    const { token, user: authUser } = useAuthStore.getState();
    if (token && authUser && fresh?.user.status) {
      useAuthStore
        .getState()
        .setAuth(token, { ...authUser, status: fresh.user.status });
    }
  }

  useEffect(() => {
    const token = syncApiAuthToken();
    if (!token) {
      setPerfLoading(false);
      return;
    }

    let cancelled = false;
    setPerfLoading(true);
    const now = new Date();

    Promise.allSettled([
      api.wallet.summary(),
      api.wallet.dailyCalendar(now.getUTCFullYear(), now.getUTCMonth() + 1),
      api.signals.mt5Running(),
      api.signals.mt5Terminal(),
      api.deriv.status(),
    ]).then((results) => {
      if (cancelled) return;
      const [wallet, calendar, runningRes, terminal, deriv] = results;
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
        setRunning(runningRes.value.trades.filter((t) => t.kind === "running"));
        setFloating(runningRes.value.stats.floatingProfit);
      }
      if (terminal.status === "fulfilled") {
        readyState.metaApi = Boolean(terminal.value.account);
        readyState.metaApiAccount = Boolean(terminal.value.account);
        const history = terminal.value.history?.items ?? [];
        const today = new Date();
        const daySum = history
          .filter((row) => {
            const t = new Date(row.closedAt);
            return (
              t.getFullYear() === today.getFullYear() &&
              t.getMonth() === today.getMonth() &&
              t.getDate() === today.getDate()
            );
          })
          .reduce((sum, row) => sum + (row.pnl ?? 0), 0);
        setDayPnl(daySum);
      }
      if (deriv.status === "fulfilled") {
        readyState.deriv = deriv.value.connected;
      }
      setApiReady(readyState);
      setPerfLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const name = useMemo(
    () =>
      data?.user.displayName?.trim() ||
      user?.displayName?.trim() ||
      user?.email ||
      "Account",
    [data?.user.displayName, user?.displayName, user?.email],
  );

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-base font-semibold text-white">Could not load dashboard</p>
        <p className="mt-2 text-sm text-gray-400">{error}</p>
        <Button size="sm" className="mt-5" onClick={() => fetchDashboard()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-4 sm:px-6 sm:py-6">
      <WithdrawPolicyAgreeModal />
      <DashboardAnnouncement />

      {data?.onboarding && (
        <OnboardingChecklist
          onboarding={data.onboarding}
          onComplete={() => void handleRegistrationComplete()}
        />
      )}

      {perfLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
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
      )}

      <InvestmentHome compact displayName={data?.user.displayName} />
    </div>
  );
}

export default function DashboardPage() {
  const { ready } = useRequireAuth();
  const { fetchDashboard } = useDashboardStore();

  useEffect(() => {
    if (!ready) return;
    const token = useAuthStore.getState().token;
    if (token) api.setToken(token);
    fetchDashboard();
  }, [ready, fetchDashboard]);

  if (!ready) return <AuthLoadingScreen />;

  return <DashboardBody />;
}
