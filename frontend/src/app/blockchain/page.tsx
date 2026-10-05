"use client";

import { useEffect, useState } from "react";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import {
  ContractEnrollFlow,
  useChainEnrollment,
} from "@/components/blockchain/contract-enroll-flow";
import { AlertTriangle, Loader2 } from "lucide-react";

function ContractMaintenanceBanner() {
  return (
    <div className="flex gap-3 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3.5 text-sm text-amber-50">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div>
        <p className="font-semibold text-amber-100">Now under maintenance</p>
        <p className="mt-1 leading-relaxed text-amber-100/85">
          Blockchain contract daily yield is temporarily paused while we carry
          out maintenance. Your contract balance remains in place.
        </p>
      </div>
    </div>
  );
}

function BlockchainGate() {
  const { enrollment, setEnrollment, loading, error } = useChainEnrollment();
  const [yieldMaintenance, setYieldMaintenance] = useState(false);

  useEffect(() => {
    if (enrollment?.yieldMaintenance !== undefined) {
      setYieldMaintenance(enrollment.yieldMaintenance);
    }
  }, [enrollment?.yieldMaintenance]);

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

  return (
    <>
      {yieldMaintenance && <ContractMaintenanceBanner />}
      <ContractEnrollFlow enrollment={enrollment} onUpdated={setEnrollment} />
    </>
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
