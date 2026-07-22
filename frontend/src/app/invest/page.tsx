"use client";

import { InvestHub } from "@/components/investor/invest-hub";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";

export default function InvestPage() {
  const { ready } = useRequireAuth();

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6 xl:max-w-7xl xl:px-8 xl:py-8">
      <div className="xl:flex xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white xl:text-3xl">Smart Invest</h1>
          <p className="mt-1 text-sm text-gray-400">
            Capital, daily yield projections, and returns history. New
            investment allocations earn yield only after 24 hours.
          </p>
        </div>
        <p className="mt-2 hidden text-xs uppercase tracking-[0.18em] text-emerald-300/70 xl:block">
          Investment command center
        </p>
      </div>
      <InvestHub />
    </div>
  );
}
