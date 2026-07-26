"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getBlockchainService,
  type IBlockchainService,
} from "@/lib/blockchain";
import type {
  DashboardPayload,
  TxActionResult,
  TxStatus,
} from "@/lib/blockchain/types";

type ActionState = {
  status: TxStatus | "idle" | "loading";
  message?: string;
  hash?: string;
};

type BlockchainContextValue = {
  service: IBlockchainService;
  data: DashboardPayload | null;
  loading: boolean;
  error: string | null;
  action: ActionState;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  deposit: (amount: number) => Promise<TxActionResult | null>;
  withdraw: (amount: number) => Promise<TxActionResult | null>;
  claim: () => Promise<TxActionResult | null>;
  compound: () => Promise<TxActionResult | null>;
  runAdmin: (
    fn: (s: IBlockchainService) => Promise<unknown>,
  ) => Promise<void>;
};

const BlockchainContext = createContext<BlockchainContextValue | null>(null);

export function BlockchainProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => getBlockchainService(), []);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ status: "idle" });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dash = await service.getDashboard();
      setData(dash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load blockchain data");
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const runTx = useCallback(
    async (fn: () => Promise<TxActionResult>) => {
      setAction({ status: "loading" });
      try {
        const result = await fn();
        setAction({
          status: result.status,
          message: result.message,
          hash: result.hash,
        });
        await refresh();
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Transaction failed";
        setAction({ status: "failed", message });
        return null;
      }
    },
    [refresh],
  );

  const connect = useCallback(async () => {
    setAction({ status: "loading", message: "Connecting wallet…" });
    try {
      await service.connectWallet("mock");
      setAction({ status: "success", message: "Wallet Connected" });
      await refresh();
    } catch (e) {
      setAction({
        status: "failed",
        message: e instanceof Error ? e.message : "Wallet connection failed",
      });
    }
  }, [service, refresh]);

  const disconnect = useCallback(async () => {
    await service.disconnectWallet();
    setAction({ status: "success", message: "Wallet Disconnected" });
    await refresh();
  }, [service, refresh]);

  const deposit = useCallback(
    (amount: number) => runTx(() => service.deposit(amount)),
    [runTx, service],
  );
  const withdraw = useCallback(
    (amount: number) => runTx(() => service.withdraw(amount)),
    [runTx, service],
  );
  const claim = useCallback(() => runTx(() => service.claim()), [runTx, service]);
  const compound = useCallback(
    () => runTx(() => service.compound()),
    [runTx, service],
  );

  const runAdmin = useCallback(
    async (fn: (s: IBlockchainService) => Promise<unknown>) => {
      setAction({ status: "loading" });
      try {
        await fn(service);
        setAction({ status: "success", message: "Admin action completed" });
        await refresh();
      } catch (e) {
        setAction({
          status: "failed",
          message: e instanceof Error ? e.message : "Admin action failed",
        });
      }
    },
    [service, refresh],
  );

  const value: BlockchainContextValue = {
    service,
    data,
    loading,
    error,
    action,
    refresh,
    connect,
    disconnect,
    deposit,
    withdraw,
    claim,
    compound,
    runAdmin,
  };

  return createElement(BlockchainContext.Provider, { value }, children);
}

export function useBlockchain() {
  const ctx = useContext(BlockchainContext);
  if (!ctx) {
    throw new Error("useBlockchain must be used within BlockchainProvider");
  }
  return ctx;
}
