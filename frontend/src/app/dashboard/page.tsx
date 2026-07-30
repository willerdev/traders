"use client";

import { useEffect } from "react";
import { useAuthStore, useDashboardStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { Button } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { DashboardInvestorPolicyBanners } from "@/components/dashboard/dashboard-investor-policy-banners";
import { InvestmentHome } from "@/components/dashboard/investment-home";

function DashboardBody() {
  const { data, loading, error, fetchDashboard } = useDashboardStore();
  const user = useAuthStore((s) => s.user);

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
      <DashboardInvestorPolicyBanners />

      {data?.onboarding && (
        <OnboardingChecklist
          onboarding={data.onboarding}
          onComplete={() => void handleRegistrationComplete()}
        />
      )}

      <InvestmentHome
        displayName={data?.user.displayName ?? user?.displayName ?? undefined}
      />
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
