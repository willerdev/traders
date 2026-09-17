"use client";

import { useCallback, useState } from "react";
import {
  claimReward,
  compound,
  contractBalance,
  deposit,
  isContractConfigured,
  pendingRewards,
  totalDeposited,
  totalUsers,
  withdraw,
} from "@/blockchain/services/blockchain";
import type { TxProgress } from "@/blockchain/types/tx-lifecycle";
import type { TxActionResult } from "@/lib/blockchain/types";

export function useContract() {
  const [progress, setProgress] = useState<TxProgress>({ stage: "idle" });
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (fn: (onProgress: (p: TxProgress) => void) => Promise<TxActionResult>) => {
      setBusy(true);
      setProgress({ stage: "preparing" });
      try {
        return await fn(setProgress);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Transaction failed";
        setProgress({ stage: "failed", error: message, message });
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    configured: isContractConfigured(),
    progress,
    busy,
    resetProgress: () => setProgress({ stage: "idle" }),
    deposit: (amount: number) => run((onP) => deposit(amount, onP)),
    withdraw: (amount: number) => run((onP) => withdraw(amount, onP)),
    claim: () => run((onP) => claimReward(onP)),
    compound: () => compound(),
    reads: {
      contractBalance,
      pendingRewards,
      totalDeposited,
      totalUsers,
    },
  };
}
