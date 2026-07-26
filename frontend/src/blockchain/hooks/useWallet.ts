"use client";

import { useCallback, useEffect, useState } from "react";
import {
  connectWallet,
  disconnectWallet,
  getWallet,
  walletManager,
} from "@/blockchain/services/blockchain";
import type { WalletState } from "@/lib/blockchain/types";

/**
 * Wallet connection hook — MetaMask account + network change aware.
 */
export function useWallet() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const w = await getWallet();
      setWallet(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read wallet");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const offAccount = walletManager.onAccountChange(() => {
      void refresh();
    });
    const offNetwork = walletManager.onNetworkChange(() => {
      void refresh();
    });
    return () => {
      offAccount();
      offNetwork();
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const w = await connectWallet();
      setWallet(w);
      return w;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connect failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      const w = await disconnectWallet();
      setWallet(w);
    } finally {
      setLoading(false);
    }
  }, []);

  return { wallet, loading, error, connect, disconnect, refresh };
}
