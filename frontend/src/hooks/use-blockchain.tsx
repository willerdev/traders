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
import { subscribeEvents, applyRuntimeContractConfig, isContractConfigured } from "@/blockchain/services/blockchain";
import type { TxProgress } from "@/blockchain/types/tx-lifecycle";
import {
  getBlockchainService,
  isHybridService,
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
  txProgress: TxProgress;
  contractConfigured: boolean;
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

function applyConfigFromPayload(dash: DashboardPayload) {
  applyRuntimeContractConfig({
    contractAddress: dash.contract.contractAddress,
    explorerUrl: dash.contract.explorerBaseUrl,
  });
}

export function BlockchainProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => getBlockchainService(), []);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  const [txProgress, setTxProgress] = useState<TxProgress>({ stage: "idle" });
  const [contractConfigured, setContractConfigured] = useState(
    () => isContractConfigured(),
  );

  useEffect(() => {
    if (isHybridService(service)) {
      service.setProgressHandler(setTxProgress);
      return () => service.setProgressHandler(undefined);
    }
  }, [service]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Prefer dedicated runtime config (API env), then dashboard merge
      try {
        const token = (() => {
          try {
            const raw = localStorage.getItem("trp-auth");
            if (!raw) return null;
            return (
              (JSON.parse(raw) as { state?: { token?: string } }).state?.token ??
              null
            );
          } catch {
            return null;
          }
        })();
        const res = await fetch("/api/v1/blockchain/contract/config", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const cfg = (await res.json()) as {
            contractAddress?: string;
            explorerBaseUrl?: string;
            rpc?: string;
            chainId?: number;
            configured?: boolean;
          };
          applyRuntimeContractConfig({
            contractAddress: cfg.contractAddress,
            explorerUrl: cfg.explorerBaseUrl,
            rpc: cfg.rpc,
            chainId: cfg.chainId,
          });
          setContractConfigured(
            Boolean(cfg.configured) || isContractConfigured(),
          );
        }
      } catch {
        /* fall through to dashboard */
      }

      const dash = await service.getDashboard();
      applyConfigFromPayload(dash);
      setContractConfigured(isContractConfigured());
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

  useEffect(() => {
    const off = subscribeEvents((ev) => {
      setAction({
        status: "success",
        message: `${ev.name} detected`,
        hash: ev.transactionHash,
      });
      void refresh();
    });
    return () => {
      off();
    };
  }, [refresh]);

  const runTx = useCallback(
    async (fn: () => Promise<TxActionResult>) => {
      setAction({ status: "loading" });
      setTxProgress({ stage: "preparing" });
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
        setTxProgress({ stage: "failed", error: message, message });
        return null;
      }
    },
    [refresh],
  );

  const connect = useCallback(async () => {
    setAction({ status: "loading", message: "Connecting wallet…" });
    try {
      await service.connectWallet("metamask");
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
    txProgress,
    contractConfigured,
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
