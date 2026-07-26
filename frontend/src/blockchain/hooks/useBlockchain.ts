"use client";

/**
 * Hook entry for blockchain reads/writes.
 * Prefer `useBlockchain` from `@/hooks/use-blockchain` for the full dashboard context.
 */
export { useWallet } from "./useWallet";
export { useContract } from "./useContract";

import { useContract } from "./useContract";
import { useWallet } from "./useWallet";

export function useBlockchain() {
  const wallet = useWallet();
  const contract = useContract();
  return { ...wallet, ...contract };
}
