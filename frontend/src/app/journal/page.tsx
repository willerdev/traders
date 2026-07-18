"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DailyIncomeJournal } from "@/components/wallet/daily-income-journal";
import { InvestmentReturnsPanel } from "@/components/investor/investment-returns";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { api, type InvestorStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";

export default function JournalPage() {
  const { ready } = useRequireAuth();
  const router = useRouter();
  const [investor, setInvestor] = useState<InvestorStatus | null>(null);

  useEffect(() => {
    if (!ready) return;
    void api.investor
      .status()
      .then(setInvestor)
      .catch(() => setInvestor(null));
  }, [ready]);

  if (!ready) {
    return <AuthLoadingScreen />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6 md:max-w-3xl xl:max-w-7xl xl:px-8 xl:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Returns journal</h1>
          <p className="mt-1 text-sm text-gray-500">
            Daily investment yield, projections, and wallet P/L calendar.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() => router.push("/invest")}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Open Invest
        </Button>
      </div>

      {investor?.active ? (
        <InvestmentReturnsPanel
          investmentBalance={investor.investmentBalance ?? 0}
          dailyYieldPercent={investor.dailyYieldPercent}
          walletEarnings={investor.walletEarnings}
          yieldPaused={investor.settings?.yieldPaused}
          displayCurrency={investor.displayCurrency}
        />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-gray-400">
          Start investing to see daily yield history and projections here.{" "}
          <Link href="/invest" className="text-primary hover:underline">
            Go to Invest
          </Link>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold text-white">
          Wallet calendar
        </h2>
        <DailyIncomeJournal />
      </div>
    </div>
  );
}
