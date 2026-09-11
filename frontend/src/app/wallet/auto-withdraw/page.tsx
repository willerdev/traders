"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { WalletAutoWithdrawSettings } from "@/components/wallet/wallet-auto-withdraw-settings";
import { WalletSavedWithdrawalWallets } from "@/components/wallet/wallet-saved-withdrawal-wallets";
import { api, type WalletSummary } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";

export default function AutoWithdrawPage() {
  const { ready } = useRequireAuth();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.wallet.summary();
      setSummary(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  if (!ready) {
    return <AuthLoadingScreen />;
  }

  const eligible = summary?.autoWithdrawEligible ?? false;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6 xl:max-w-7xl xl:space-y-6 xl:px-8 xl:py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <Link
          href="/wallet"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to wallet
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Clock className="h-5 w-5" />
              <span className="text-sm font-medium uppercase tracking-wide">
                Money
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Daily auto-withdraw
            </h1>
            <p className="max-w-3xl text-sm text-muted">
              Schedule automatic sends from your platform wallet to a saved TRC20
              address every day at 09:00 Kampala time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href="/wallet">Open wallet</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/settings">KYC &amp; settings</Link>
            </Button>
          </div>
        </div>
      </motion.div>

      {loading && !summary ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4 xl:grid xl:grid-cols-12 xl:items-start xl:gap-5 xl:space-y-0">
          {summary && (
            <Card className="xl:col-span-4 xl:row-start-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Available balance</CardTitle>
                <CardDescription>
                  Auto-withdraw pulls from your withdrawable wallet balance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(summary.availableBalance)}
                </p>
                {!eligible && (
                  <p className="mt-2 text-xs text-muted">
                    Eligibility: new wallet depositors only
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="xl:col-span-8 xl:row-start-1">
            <CardHeader>
              <CardTitle className="text-base">Withdrawal wallets</CardTitle>
              <CardDescription>
                Add a TRC20 address below, then verify it by email before
                turning on auto-withdraw.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WalletSavedWithdrawalWallets />
            </CardContent>
          </Card>

          <Card className="xl:col-span-12 xl:row-start-2">
            <CardHeader>
              <CardTitle className="text-base">Auto-withdraw settings</CardTitle>
              <CardDescription>
                Choose destination, amount, and turn daily sends on or off.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WalletAutoWithdrawSettings
                eligible={eligible}
                onUpdated={() => void refresh()}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
