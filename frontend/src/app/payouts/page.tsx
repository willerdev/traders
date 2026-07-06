"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { api, PayoutRecord, UserSettings, PayoutRewardStatus } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Wallet, Info, ShieldAlert, Loader2 } from "lucide-react";
import { PayoutRewardTiersCard } from "@/components/dashboard/payout-reward-tiers";
import { PayoutRequestForm } from "@/components/payments/payout-request-form";

function payoutTitle(payout: PayoutRecord) {
  if (payout.source === "TP_REWARD") {
    return payout.notes?.replace(/^TP reward — /, "TP reward: ") ?? "TP reward payout";
  }
  return `Week ${payout.weekNumber}, ${payout.year}`;
}

export default function PayoutsPage() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [rewardTier, setRewardTier] = useState<PayoutRewardStatus | null>(null);
  const [kycStatus, setKycStatus] = useState<string>("NOT_STARTED");
  const [loading, setLoading] = useState(true);

  function reload() {
    return Promise.all([
      api.payouts.history().catch(() => [] as PayoutRecord[]),
      api.users.settings().catch(() => null),
      api.payouts.rewardTier().catch(() => null),
    ]).then(([history, userSettings, tier]) => {
      setPayouts(history);
      setSettings(userSettings);
      setRewardTier(tier);
      setKycStatus(userSettings?.kyc?.status ?? "NOT_STARTED");
    });
  }

  useEffect(() => {
    if (!ready) return;
    reload().finally(() => setLoading(false));
  }, [ready]);

  if (!ready) {
    return <AuthLoadingScreen />;
  }

  const statusVariant = (status: string) => {
    switch (status) {
      case "PAID":
        return "success" as const;
      case "APPROVED":
        return "default" as const;
      case "REJECTED":
        return "danger" as const;
      default:
        return "secondary" as const;
    }
  };

  const kycApproved = kycStatus === "APPROVED";
  const pendingRequest = payouts.filter(
    (p) => p.status === "PENDING" && !p.walletAddress,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Payouts</h1>
          <p className="mt-1 text-gray-400">
            Weekly USDT rewards by performance tier — $10 Starter, $50 Pro, $100 Elite
          </p>
        </div>

        {rewardTier && (
          <div className="mb-6">
            <PayoutRewardTiersCard reward={rewardTier} compact />
          </div>
        )}

        {!kycApproved && (
          <Card className="mb-6 border-rank-gold/30 bg-rank-gold/5">
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <ShieldAlert className="h-5 w-5 shrink-0 text-rank-gold mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">KYC required for payouts only</p>
                  <p className="text-sm text-muted">
                    Complete identity verification in Settings before submitting a withdrawal.
                    {kycStatus === "PENDING" && " Your submission is under review."}
                    {kycStatus === "REJECTED" &&
                      " Your last submission was rejected — upload new documents and resubmit."}
                  </p>
                </div>
              </div>
              <Link href={kycStatus === "REJECTED" ? "/settings#kyc" : "/settings"}>
                <Button variant="secondary" size="sm">
                  {kycStatus === "REJECTED" ? "Retry KYC" : "Complete KYC"}
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {pendingRequest.length > 0 && kycApproved && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Ready to request</CardTitle>
              <CardDescription>
                Use your saved payout details or enter a destination for pending weekly payouts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingRequest.map((payout) => (
                <div
                  key={payout.id}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">
                        {payoutTitle(payout)}
                      </p>
                      <p className="text-sm text-gray-500">
                        Your share: {formatCurrency(Number(payout.traderShare))}
                      </p>
                    </div>
                    <Badge variant="gold">Action needed</Badge>
                  </div>
                  <PayoutRequestForm
                    disabled={!kycApproved}
                    settings={settings}
                    onSubmit={async (walletAddress) => {
                      await api.payouts.request(payout.id, walletAddress);
                      await reload();
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardContent className="flex items-start gap-3 pt-6">
            <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <p className="text-sm text-gray-300">
              Trader payouts are funded by subscription revenue, premium memberships,
              signal marketplace fees, and sponsorships — not registration fees.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <CardTitle>Payout History</CardTitle>
            </div>
            <CardDescription>
              Track submitted requests and admin approvals
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : payouts.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                No payouts yet. Keep trading to earn weekly profits.
              </p>
            ) : (
              <div className="space-y-3">
                {payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="rounded-lg border border-white/5 bg-white/[0.02] p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">
                          {payoutTitle(payout)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Virtual profit: {formatCurrency(Number(payout.virtualProfit))}
                        </p>
                        {payout.payoutMethod && (
                          <p className="mt-1 text-xs text-gray-500">
                            Method: {payout.payoutMethod === "MOBILE_MONEY" ? "Mobile money" : "TRC20"}
                          </p>
                        )}
                        {payout.rewardTier && (
                          <p className="mt-1 text-xs text-gray-500">
                            Tier: {payout.rewardTier}
                          </p>
                        )}
                        {payout.walletAddress && (
                          <p className="mt-1 truncate font-mono text-xs text-gray-600">
                            {payout.walletAddress}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-success">
                          {formatCurrency(Number(payout.traderShare))}
                        </p>
                        <Badge variant={statusVariant(payout.status)} className="mt-1">
                          {payout.walletAddress && payout.status === "PENDING"
                            ? "Awaiting approval"
                            : payout.status}
                        </Badge>
                      </div>
                    </div>
                    {payout.status === "PENDING" &&
                      !payout.walletAddress &&
                      kycApproved && (
                        <div className="mt-3 border-t border-white/5 pt-3">
                          <PayoutRequestForm
                            settings={settings}
                            onSubmit={async (walletAddress) => {
                              await api.payouts.request(payout.id, walletAddress);
                              await reload();
                            }}
                          />
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
