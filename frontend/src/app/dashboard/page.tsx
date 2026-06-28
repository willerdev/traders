"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardStats } from "@/components/dashboard/stats-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore, useDashboardStore } from "@/stores/auth";
import { Send, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { Mt5PositionsPanel } from "@/components/dashboard/open-positions";
import { UnresolvedSetupsCard } from "@/components/dashboard/unresolved-setups";
import { PayoutRewardTiersCard } from "@/components/dashboard/payout-reward-tiers";
import { RegistrationCheckout } from "@/components/payments/registration-checkout";
import { RISK_PERCENT, MAX_RISK_PER_TRADE } from "@/lib/platform-rules";

export default function DashboardPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data, loading, error, fetchDashboard } = useDashboardStore();

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (token) api.setToken(token);

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    fetchDashboard();
  }, [isAuthenticated, router, fetchDashboard]);

  async function handleRegistrationComplete() {
    await fetchDashboard();
    const data = useDashboardStore.getState().data;
    const { token, user } = useAuthStore.getState();
    if (token && user && data?.user.status) {
      useAuthStore.getState().setAuth(token, { ...user, status: data.user.status });
    }
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-lg font-semibold text-white">Could not load dashboard</p>
        <p className="mt-2 text-sm text-gray-400">
          {error || "Something went wrong. Check that the API is running."}
        </p>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => fetchDashboard()}>Retry</Button>
          <Button variant="secondary" onClick={() => router.push("/login")}>
            Sign in again
          </Button>
        </div>
      </div>
    );
  }

  const account = data.account;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {data.user.displayName}
          </h1>
          <p className="mt-1 text-gray-400">
            Track your performance and climb the leaderboard
          </p>
        </div>
        <Link href="/submit">
          <Button className="gap-2">
            <Send className="h-4 w-4" />
            Submit Signal
          </Button>
        </Link>
      </motion.div>

      {data.onboarding && (
        <OnboardingChecklist
          onboarding={data.onboarding}
          onComplete={handleRegistrationComplete}
        />
      )}

      {data.user.status === "PENDING_PAYMENT" && !data.onboarding && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Complete Registration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-gray-400">
              Pay 5 USDT to unlock setup submission. Invite codes are available on request.
            </p>
            <RegistrationCheckout onComplete={handleRegistrationComplete} />
          </CardContent>
        </Card>
      )}

      {account && (
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

      {data.payoutReward && (
        <div className="mt-8">
          <PayoutRewardTiersCard reward={data.payoutReward} />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <UnresolvedSetupsCard onClaimed={() => fetchDashboard()} />
        <Mt5PositionsPanel />

        <Card>
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentSignals.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-gray-500">No signals submitted yet</p>
                <Link href="/submit" className="mt-4 inline-block">
                  <Button variant="secondary" size="sm" className="gap-2">
                    Submit your first signal
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data.recentSignals.map((signal) => (
                  <div
                    key={signal.id}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {signal.symbol}
                        </span>
                        <Badge
                          variant={
                            signal.direction === "BUY" ? "success" : "danger"
                          }
                        >
                          {signal.direction}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Entry: {Number(signal.entryMin)} – {Number(signal.entryMax)}
                        {" · "}
                        {new Date(signal.submittedAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="secondary">{signal.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: "Starting Balance", value: "$1,000 virtual" },
                { label: "Risk Per Trade", value: `${RISK_PERCENT}% fixed ($${MAX_RISK_PER_TRADE} max)` },
                { label: "TP Hit Reward", value: "$5 USDT auto-credited to wallet" },
                { label: "Win Points", value: "+10 points" },
                { label: "Loss Points", value: "-5 points" },
                { label: "Payout Split", value: "40% trader / 60% platform" },
                {
                  label: "Payout Source",
                  value: "Subscriptions & marketplace revenue",
                },
              ].map((rule) => (
                <div
                  key={rule.label}
                  className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0"
                >
                  <span className="text-sm text-gray-400">{rule.label}</span>
                  <span className="text-sm font-medium text-white">
                    {rule.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {data.walletTransactions && data.walletTransactions.length > 0 && (
          <Card className="mt-6 lg:col-span-2">
            <CardHeader>
              <CardTitle>Trade Wallet Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.walletTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3"
                  >
                    <div>
                      <p className="text-sm text-white">{tx.description}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={
                        Number(tx.amount) >= 0
                          ? "font-bold text-success"
                          : "font-bold text-danger"
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
      </div>
    </div>
  );
}
