"use client";

import { LoansHub } from "@/components/loans/loans-hub";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";

export default function LoansPage() {
  const { ready } = useRequireAuth();

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Loans</h1>
        <p className="mt-1 text-sm text-gray-400">
          Advance against your daily investment earnings — weekly example: $10/day
          → $70 projected → $56 advance (80%) + $11.20 interest (20%).
        </p>
      </div>
      <LoansHub />
    </div>
  );
}
