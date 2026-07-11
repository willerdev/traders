"use client";

import { Suspense, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { DashboardStats } from "@/components/dashboard/stats-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore, useDashboardStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { formatCurrency } from "@/lib/utils";
import { hasTradingAccess, formatAccessExpiry } from "@/lib/trading-access";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { WeeklyAccessGate } from "@/components/payments/weekly-access-gate";
import { ArchivedSetupsCard } from "@/components/dashboard/archived-setups";
import { HubExecutionsCard } from "@/components/dashboard/hub-executions";
import { Mt5PositionsPanel } from "@/components/dashboard/open-positions";
import { UnresolvedSetupsCard } from "@/components/dashboard/unresolved-setups";
import { RecentSignalsCard } from "@/components/dashboard/recent-signals-card";
import { PayoutRewardTiersCard } from "@/components/dashboard/payout-reward-tiers";
import { ProfitShareCard } from "@/components/dashboard/profit-share-card";
import { RISK_PERCENT, MAX_RISK_PER_TRADE } from "@/lib/platform-rules";
import {
  DashboardHubTabs,
  useDashboardTab,
} from "@/components/dashboard/dashboard-hub-tabs";
import { DepositorPanel } from "@/components/depositor/depositor-panel";
import { EvaluationStatusCard } from "@/components/evaluations/evaluation-status-card";

function DashboardBody() {
  const tab = useDashboardTab();
  const router = useRouter();
  const { data, loading, error, fetchDashboard } = useDashboardStore();

  useEffect(() => {
    if (tab === "investor") {
      router.replace("/invest");
    }
  }, [tab, router]);

  async function handleRegistrationComplete() {
    await fetchDashboard();
    const fresh = useDashboardStore.getState().data;
    const { token, user } = useAuthStore.getState();
    if (token && user && fresh?.user.status) {
      useAuthStore.getState().setAuth(token, { ...user, status: fresh.user.status });
    }
  }

  if (tab === "investor") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-base font-semibold text-white">Could not load dashboard</p>
        <p className="mt-2 text-sm text-gray-400">
          {error || "Something went wrong. Check that the API is running."}
        </p>
        <div className="mt-5 flex gap-3">
          <Button size="sm" onClick={() => fetchDashboard()}>
            Retry
          </Button>
          <Button size="sm" variant="secondary" onClick={() => router.push("/login")}>
            Sign in again
          </Button>
        </div>
      </div>
    );
  }

  const account = data.account;
  const tradingActive = hasTradingAccess(data.user);
  const accessLabel = formatAccessExpiry(data.user.accessExpiresAt);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-5">
      <DashboardHubTabs active={tab} />

      {tab === "depositor" && <DepositorPanel />}

      {tab === "trader" && (
        <>
          {!tradingActive && (
            <WeeklyAccessGate
              renewal={Boolean(data.user.registrationPaid)}
              onComplete={() => void fetchDashboard()}
              title={
                data.user.registrationPaid
                  ? "Weekly access expired"
                  : "Activate weekly trading"
              }
            />
          )}

          {tradingActive && accessLabel && (
            <p className="text-xs text-muted">
              Trading access ·{" "}
              <span className="text-foreground">{accessLabel}</span>
            </p>
          )}
          {data.onboarding && (
            <OnboardingChecklist
              onboarding={data.onboarding}
              onComplete={handleRegistrationComplete}
            />
          )}

          <EvaluationStatusCard />

          {account && tradingActive && (
            <DashboardStats
              balance={Number(account.balance)}
              weeklyProfit={Number(account.weeklyProfit)}
              winRate={Number(account.winRate)}
              rank={data.rank}
              tier={data.tier}
              score={account.score}
              consecutiveWins={account.consecutiveWins}
              consecutiveLosses={account.consecutiveLosses}
              drawdown={Number(account.maxDrawdown)}
            />
          )}

          {data.payoutReward && !data.profitShare?.active && (
            <PayoutRewardTiersCard reward={data.payoutReward} />
          )}

          {data.profitShare && (
            <ProfitShareCard
              status={data.profitShare}
              tradingActive={tradingActive}
              onRefresh={() => void fetchDashboard()}
            />
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="grid gap-4 lg:grid-cols-2"
          >
            <UnresolvedSetupsCard onClaimed={() => fetchDashboard()} />
            <Mt5PositionsPanel />
            <ArchivedSetupsCard />
            <HubExecutionsCard />

            <RecentSignalsCard
              signals={data.recentSignals}
              onRefresh={() => fetchDashboard()}
            />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Account Rules</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y divide-white/5">
                  {[
                    { label: "Starting Balance", value: "$1,000 virtual" },
                    {
                      label: "Risk Per Trade",
                      value: `${RISK_PERCENT}% fixed ($${MAX_RISK_PER_TRADE} max)`,
                    },
                    { label: "TP Hit Reward", value: "$5 USDT auto-credited" },
                    { label: "Win / Loss Points", value: "+10 / −5" },
                    {
                      label: "Payout Split",
                      value: data.profitShare?.active
                        ? "50% profit share"
                        : "40% trader / 60% platform",
                    },
                  ].map((rule) => (
                    <div
                      key={rule.label}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="text-xs text-gray-400">{rule.label}</span>
                      <span className="text-right text-xs font-medium text-white">
                        {rule.value}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {data.walletTransactions && data.walletTransactions.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Trade Wallet Activity</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    {data.walletTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white">
                            {tx.description}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {new Date(tx.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <span
                          className={
                            Number(tx.amount) >= 0
                              ? "shrink-0 text-sm font-bold text-success"
                              : "shrink-0 text-sm font-bold text-danger"
                          }
                        >
                          {Number(tx.amount) >= 0 ? "+" : ""}
                          {formatCurrency(Number(tx.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </>
      )}
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

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <DashboardBody />
    </Suspense>
  );
}
