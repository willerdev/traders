"use client";

import { BlockchainDashboard } from "@/components/blockchain/blockchain-dashboard";
import { BlockchainProvider } from "@/hooks/use-blockchain";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";

export default function BlockchainPage() {
  const { ready } = useRequireAuth();

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-6 xl:px-8 xl:py-8">
      <BlockchainProvider>
        <BlockchainDashboard />
      </BlockchainProvider>
    </div>
  );
}
