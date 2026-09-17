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
  subscribeEvents,
  applyRuntimeContractConfig,
  isContractConfigured,
} from "@/blockchain/services/blockchain";
import {
  runVaultPreflight,
  type PreflightCheck,
} from "@/blockchain/services/preflight";
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
  /** True only after every vault preflight check passes */
  vaultReady: boolean;
  preflightChecks: PreflightCheck[];
  preflightAddress: string;
  preflightRunning: boolean;
  runPreflight: () => Promise<boolean>;
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
  const [vaultReady, setVaultReady] = useState(false);
  const [preflightChecks, setPreflightChecks] = useState<PreflightCheck[]>([]);
  const [preflightAddress, setPreflightAddress] = useState("");
  const [preflightRunning, setPreflightRunning] = useState(true);

  useEffect(() => {
    if (isHybridService(service)) {
      service.setProgressHandler(setTxProgress);
      return () => service.setProgressHandler(undefined);
    }
  }, [service]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dash = await service.getDashboard();
      applyConfigFromPayload(dash);
      setContractConfigured(isContractConfigured());
      setData(dash);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to load blockchain data";
      setError(null);
      setData(null);
      setVaultReady(false);
      setPreflightChecks((prev) =>
        prev.map((c) =>
          c.id === "snapshot"
            ? { ...c, status: "fail" as const, detail: message }
            : c,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [service]);

  const runPreflight = useCallback(async () => {
    setPreflightRunning(true);
    setError(null);
    setData(null);
    setVaultReady(false);
    setLoading(true);
    try {
      const result = await runVaultPreflight({
        onUpdate: setPreflightChecks,
      });
      setPreflightChecks(result.checks);
      setPreflightAddress(result.address);
      setContractConfigured(isContractConfigured());
      if (!result.ok) {
        setVaultReady(false);
        setLoading(false);
        return false;
      }
      setVaultReady(true);
      await loadDashboard();
      return true;
    } catch (e) {
      setVaultReady(false);
      setError(e instanceof Error ? e.message : "Preflight failed");
      setLoading(false);
      return false;
    } finally {
      setPreflightRunning(false);
    }
  }, [loadDashboard]);

  const refresh = useCallback(async () => {
    if (!vaultReady) {
      await runPreflight();
      return;
    }
    await loadDashboard();
  }, [vaultReady, runPreflight, loadDashboard]);

  useEffect(() => {
    void runPreflight();
  }, [runPreflight]);

  useEffect(() => {
    if (!vaultReady) return;
    const id = setInterval(() => void loadDashboard(), 30_000);
    return () => clearInterval(id);
  }, [vaultReady, loadDashboard]);

  useEffect(() => {
    if (!vaultReady) return;
    const off = subscribeEvents((ev) => {
      setAction({
        status: "success",
        message: `${ev.name} detected`,
        hash: ev.transactionHash,
      });
      void loadDashboard();
    });
    return () => {
      off();
    };
  }, [vaultReady, loadDashboard]);

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
        await loadDashboard();
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Transaction failed";
        setAction({ status: "failed", message });
        setTxProgress({ stage: "failed", error: message, message });
        return null;
      }
    },
    [loadDashboard],
  );

  const connect = useCallback(async () => {
    setAction({ status: "loading", message: "Connecting wallet…" });
    try {
      await service.connectWallet("metamask");
      setAction({ status: "success", message: "Wallet Connected" });
      await loadDashboard();
    } catch (e) {
      setAction({
        status: "failed",
        message: e instanceof Error ? e.message : "Wallet connection failed",
      });
    }
  }, [service, loadDashboard]);

  const disconnect = useCallback(async () => {
    await service.disconnectWallet();
    setAction({ status: "success", message: "Wallet Disconnected" });
    await loadDashboard();
  }, [service, loadDashboard]);

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
        await loadDashboard();
      } catch (e) {
        setAction({
          status: "failed",
          message: e instanceof Error ? e.message : "Admin action failed",
        });
      }
    },
    [service, loadDashboard],
  );

  const value: BlockchainContextValue = {
    service,
    data,
    loading,
    error,
    action,
    txProgress,
    contractConfigured,
    vaultReady,
    preflightChecks,
    preflightAddress,
    preflightRunning,
    runPreflight,
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
