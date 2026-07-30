"use client";

import { DailyIncomeJournal } from "@/components/wallet/daily-income-journal";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";

export default function JournalPage() {
  const { ready } = useRequireAuth();

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="mx-auto max-w-lg px-4 py-4 sm:max-w-2xl sm:px-6 sm:py-6 md:max-w-3xl">
      <DailyIncomeJournal />
    </div>
  );
}
