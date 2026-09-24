"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { WalletAutoWithdrawSettings } from "@/components/wallet/wallet-auto-withdraw-settings";
import { NowpaymentsPayoutLoginCard } from "@/components/wallet/nowpayments-payout-login-card";
import { api, type WalletSummary } from "@/lib/api";
import {
  SOLO_WALLET_WITHDRAW_PAUSED_LABEL,
  isSoloWalletWithdrawEnabled,
} from "@/lib/solo-wallet-withdraw";
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
    <div className="mx-auto max-w-lg space-y-5 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6 xl:max-w-2xl xl:px-8 xl:py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <Link
          href="/wallet"
          className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Wallet
        </Link>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Clock className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan">
              soloEmma
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              Daily auto-withdraw
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Send available USDT to a saved TRC20 wallet every day at 09:00
              Kampala time. This is the soloEmma platform wallet. Deriv
              cashout addresses are saved under Journal or Deriv.
            </p>
            {!isSoloWalletWithdrawEnabled(summary) ? (
              <p className="mt-2 text-sm font-medium text-amber-300">
                {SOLO_WALLET_WITHDRAW_PAUSED_LABEL}
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>

      {loading && !summary ? (
        <div className="flex min-h-[220px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
        <NowpaymentsPayoutLoginCard />
        <WalletAutoWithdrawSettings
          eligible={eligible}
          availableBalance={summary?.availableBalance}
          onUpdated={() => void refresh()}
        />
        </>
      )}
    </div>
  );
}
