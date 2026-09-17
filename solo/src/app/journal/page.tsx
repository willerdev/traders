"use client";

import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { TradingJournal } from "@/components/journal/trading-journal";

export default function JournalPage() {
  const { ready } = useRequireAuth();
  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 xl:max-w-5xl">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan">
          soloEmma
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">Journal</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          One place for MT5 closes, Deriv statement rows, and the platform USDT
          wallet. Deriv crypto addresses are saved here too — they are not the
          same as Wallet auto-withdraw.
        </p>
      </div>
      <TradingJournal />
    </div>
  );
}
