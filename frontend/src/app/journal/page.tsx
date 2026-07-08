"use client";

import { DailyIncomeJournal } from "@/components/wallet/daily-income-journal";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";

export default function JournalPage() {
  const { ready } = useRequireAuth();

  if (!ready) {
    return <AuthLoadingScreen />;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 md:max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Daily income journal</h1>
        <p className="mt-1 text-sm text-gray-500">
          Calendar view of daily wallet profit and loss — tap a day for details.
        </p>
      </div>
      <DailyIncomeJournal />
    </div>
  );
}
