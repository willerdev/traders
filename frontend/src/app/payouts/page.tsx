"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";
import { api, PayoutRecord } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Wallet, Info, ShieldAlert } from "lucide-react";

export default function PayoutsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [kycStatus, setKycStatus] = useState<string>("NOT_STARTED");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    Promise.all([
      api.payouts.history().catch(() => [] as PayoutRecord[]),
      api.users.settings().catch(() => null),
    ])
      .then(([history, settings]) => {
        setPayouts(history);
        setKycStatus(settings?.kyc?.status ?? "NOT_STARTED");
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated, router]);

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Payouts</h1>
          <p className="mt-1 text-gray-400">
            Weekly profit sharing — 40% trader / 60% platform
          </p>
        </div>

        {kycStatus !== "APPROVED" && (
          <Card className="mb-6 border-rank-gold/30 bg-rank-gold/5">
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <ShieldAlert className="h-5 w-5 shrink-0 text-rank-gold mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">KYC required for payouts</p>
                  <p className="text-sm text-muted">
                    Complete identity verification in Settings before requesting withdrawals.
                    {kycStatus === "PENDING" && " Your submission is under review."}
                  </p>
                </div>
              </div>
              <Link href="/settings">
                <Button variant="secondary" size="sm">
                  Complete KYC
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardContent className="flex items-start gap-3 pt-6">
            <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="text-sm text-gray-300">
                Trader payouts are funded by subscription revenue, premium
                memberships, signal marketplace fees, copy-trading commissions,
                and sponsorships — not registration fees.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <CardTitle>Payout History</CardTitle>
            </div>
            <CardDescription>
              Request payouts to your crypto wallet once approved
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
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-4"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        Week {payout.weekNumber}, {payout.year}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Virtual profit:{" "}
                        {formatCurrency(Number(payout.virtualProfit))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-success">
                        {formatCurrency(Number(payout.traderShare))}
                      </p>
                      <Badge variant={statusVariant(payout.status)} className="mt-1">
                        {payout.status}
                      </Badge>
                    </div>
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
