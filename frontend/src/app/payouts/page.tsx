"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth";
import { api, PayoutRecord } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Wallet, Info, ShieldAlert, Loader2 } from "lucide-react";

function PayoutRequestForm({
  payout,
  disabled,
  onSubmitted,
}: {
  payout: PayoutRecord;
  disabled: boolean;
  onSubmitted: () => void;
}) {
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.payouts.request(payout.id, wallet.trim());
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 border-t border-white/5 pt-3">
      <Label htmlFor={`wallet-${payout.id}`} className="text-xs text-gray-400">
        USDT wallet address (TRC20 / BEP20)
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={`wallet-${payout.id}`}
          placeholder="Your crypto wallet address"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          disabled={disabled || loading}
          className="font-mono text-sm"
        />
        <Button type="submit" size="sm" disabled={disabled || loading || !wallet.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request payout"}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

export default function PayoutsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [kycStatus, setKycStatus] = useState<string>("NOT_STARTED");
  const [loading, setLoading] = useState(true);

  function reload() {
    return Promise.all([
      api.payouts.history().catch(() => [] as PayoutRecord[]),
      api.users.settings().catch(() => null),
    ]).then(([history, settings]) => {
      setPayouts(history);
      setKycStatus(settings?.kyc?.status ?? "NOT_STARTED");
    });
  }

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    reload().finally(() => setLoading(false));
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
            Weekly profit sharing — 40% trader / 60% platform
          </p>
        </div>

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

        {pendingRequest.length > 0 && kycApproved && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Ready to request</CardTitle>
              <CardDescription>
                Submit your USDT wallet address for pending weekly payouts
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
                        Week {payout.weekNumber}, {payout.year}
                      </p>
                      <p className="text-sm text-gray-500">
                        Your share: {formatCurrency(Number(payout.traderShare))}
                      </p>
                    </div>
                    <Badge variant="gold">Action needed</Badge>
                  </div>
                  <PayoutRequestForm
                    payout={payout}
                    disabled={!kycApproved}
                    onSubmitted={() => reload()}
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
                          Week {payout.weekNumber}, {payout.year}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Virtual profit: {formatCurrency(Number(payout.virtualProfit))}
                        </p>
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
                        <PayoutRequestForm
                          payout={payout}
                          disabled={false}
                          onSubmitted={() => reload()}
                        />
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
