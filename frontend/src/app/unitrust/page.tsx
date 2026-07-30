"use client";

import { UnitrustHub } from "@/components/unitrust/unitrust-hub";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";

export default function UnitrustPage() {
  const { ready } = useRequireAuth();

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Unitrust</h1>
        <p className="mt-1 text-sm text-gray-400">
          5% daily on your corpus. Withdraw to wallet once per month.
        </p>
      </div>
      <UnitrustHub />
    </div>
  );
}
