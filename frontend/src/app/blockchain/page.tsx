"use client";

import { BlockchainDashboard } from "@/components/blockchain/blockchain-dashboard";
import { BlockchainProvider } from "@/hooks/use-blockchain";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import {
  ContractEnrollFlow,
  useChainEnrollment,
} from "@/components/blockchain/contract-enroll-flow";
import { Loader2 } from "lucide-react";

function BlockchainGate() {
  const { enrollment, setEnrollment, loading, error } = useChainEnrollment();

  if (loading || !enrollment) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        {error}
      </p>
    );
  }

  if (!enrollment.canAccessLiveDashboard) {
    return (
      <ContractEnrollFlow enrollment={enrollment} onUpdated={setEnrollment} />
    );
  }

  return (
    <BlockchainProvider>
      <BlockchainDashboard
        enrollment={enrollment}
        onEnrollmentChange={setEnrollment}
      />
    </BlockchainProvider>
  );
}

export default function BlockchainPage() {
  const { ready } = useRequireAuth();

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-6 xl:px-8 xl:py-8">
      <BlockchainGate />
    </div>
  );
}
