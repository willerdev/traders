import type {
  ActivityItem,
  AdminDashboard,
  BlockchainNotification,
  BlockchainTransaction,
  ContractEvent,
  ContractHealth,
  ContractStats,
  ContractStatus,
  DashboardPayload,
  InvestmentStatistics,
  InvestorRow,
  TxActionResult,
  WalletState,
} from "./types";

/**
 * Abstraction over the investment smart contract.
 *
 * Default provider: HybridBlockchainService (MetaMask + ethers DemoVault + API cache).
 * Set NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=api for mocks only.
 */
export interface IBlockchainService {
  connectWallet(provider?: "metamask" | "walletconnect" | "coinbase" | "mock"): Promise<WalletState>;
  disconnectWallet(): Promise<WalletState>;
  getWallet(): Promise<WalletState>;
  getNetwork(): Promise<{
    network: string;
    networkLabel: string;
    networkMode: string;
    explorerBaseUrl: string;
  }>;
  getContractInfo(): Promise<ContractStatus>;
  getContractBalance(): Promise<{
    balance: number;
    balanceUsd: number;
    symbol: string;
  }>;
  getUserBalance(): Promise<{
    walletBalance: number;
    investmentBalance: number;
  }>;
  getRewards(): Promise<{
    pendingRewards: number;
    claimableRewards: number;
    nextRewardAt: string;
  }>;
  deposit(amount: number): Promise<TxActionResult>;
  withdraw(amount: number): Promise<TxActionResult>;
  claim(): Promise<TxActionResult>;
  compound(): Promise<TxActionResult>;
  getTransactions(params?: {
    q?: string;
    type?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: BlockchainTransaction[];
    total: number;
    page: number;
    pageSize: number;
  }>;
  getStatistics(): Promise<InvestmentStatistics>;
  getEvents(): Promise<ContractEvent[]>;
  getActivity(): Promise<ActivityItem[]>;
  getInvestors(params?: {
    q?: string;
    sort?: string;
    order?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: InvestorRow[];
    total: number;
    page: number;
    pageSize: number;
  }>;
  getNotifications(): Promise<BlockchainNotification[]>;
  getDashboard(): Promise<DashboardPayload>;
  getContractStats(): Promise<ContractStats>;
  getAdmin(): Promise<AdminDashboard>;
  getHealth(): Promise<ContractHealth>;
  sync(): Promise<{ ok: boolean; lastSynchronization: string; message: string }>;
  pauseContract(): Promise<{ ok: boolean; paused: boolean; message: string }>;
  unpauseContract(): Promise<{ ok: boolean; paused: boolean; message: string }>;
  updateRewardRate(rate: number): Promise<{ ok: boolean; rate: number; message: string }>;
  updateTreasuryWallet(address: string): Promise<{ ok: boolean; address: string; message: string }>;
  updateFee(feeBps: number): Promise<{ ok: boolean; feeBps: number; message: string }>;
  emergencyWithdraw(): Promise<TxActionResult>;
  reindexTransactions(): Promise<{ ok: boolean; indexed: number }>;
  reconnectRpc(): Promise<{ ok: boolean; latencyMs: number }>;
}

type Query = Record<string, string | number | undefined>;

function qs(params?: Query): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("trp-auth");
    if (!raw) return null;
    return (JSON.parse(raw) as { state?: { token?: string } }).state?.token ?? null;
  } catch {
    return null;
  }
}

async function chainFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = readToken();
  const res = await fetch(`/api/v1/blockchain${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { message?: string | string[] }).message;
    throw new Error(
      Array.isArray(msg) ? msg.join(", ") : msg || res.statusText || "Request failed",
    );
  }
  return res.json() as Promise<T>;
}

/** UI → Nest mock BlockchainService. Replace with EthersBlockchainService when live. */
export class ApiBlockchainService implements IBlockchainService {
  connectWallet() {
    return chainFetch<WalletState>("/wallet/connect", { method: "POST", body: "{}" });
  }
  disconnectWallet() {
    return chainFetch<WalletState>("/wallet/disconnect", { method: "POST", body: "{}" });
  }
  getWallet() {
    return chainFetch<WalletState>("/wallet");
  }
  getNetwork() {
    return this.getContractInfo().then((c) => ({
      network: c.network,
      networkLabel: c.networkLabel,
      networkMode: c.networkMode,
      explorerBaseUrl: c.explorerBaseUrl,
    }));
  }
  getContractInfo() {
    return chainFetch<ContractStatus>("/contract/status");
  }
  getContractBalance() {
    return this.getContractStats().then((s) => ({
      balance: s.contractBalance,
      balanceUsd: s.contractBalanceUsd,
      symbol: s.symbol,
    }));
  }
  getUserBalance() {
    return this.getWallet().then((w) => ({
      walletBalance: w.balance,
      investmentBalance: w.investmentBalance,
    }));
  }
  getRewards() {
    return this.getWallet().then((w) => ({
      pendingRewards: w.pendingRewards,
      claimableRewards: w.claimableRewards,
      nextRewardAt: w.nextRewardAt,
    }));
  }
  deposit(amount: number) {
    return chainFetch<TxActionResult>("/deposit", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
  }
  withdraw(amount: number) {
    return chainFetch<TxActionResult>("/withdraw", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
  }
  claim() {
    return chainFetch<TxActionResult>("/claim", { method: "POST", body: "{}" });
  }
  compound() {
    return chainFetch<TxActionResult>("/compound", { method: "POST", body: "{}" });
  }
  getTransactions(params?: Query) {
    return chainFetch<{
      items: BlockchainTransaction[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/transactions${qs(params)}`);
  }
  getStatistics() {
    return chainFetch<InvestmentStatistics>("/statistics");
  }
  getEvents() {
    return chainFetch<ContractEvent[]>("/events");
  }
  getActivity() {
    return chainFetch<ActivityItem[]>("/activity");
  }
  getInvestors(params?: Query) {
    return chainFetch<{
      items: InvestorRow[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/investors${qs(params)}`);
  }
  getNotifications() {
    return chainFetch<BlockchainNotification[]>("/notifications");
  }
  getDashboard() {
    return chainFetch<DashboardPayload>("/dashboard");
  }
  getContractStats() {
    return chainFetch<ContractStats>("/contract/stats");
  }
  getAdmin() {
    return chainFetch<AdminDashboard>("/admin");
  }
  getHealth() {
    return chainFetch<ContractHealth>("/health");
  }
  sync() {
    return chainFetch<{ ok: boolean; lastSynchronization: string; message: string }>(
      "/sync",
      { method: "POST", body: "{}" },
    );
  }
  pauseContract() {
    return chainFetch<{ ok: boolean; paused: boolean; message: string }>(
      "/admin/pause",
      { method: "POST", body: "{}" },
    );
  }
  unpauseContract() {
    return chainFetch<{ ok: boolean; paused: boolean; message: string }>(
      "/admin/unpause",
      { method: "POST", body: "{}" },
    );
  }
  updateRewardRate(rate: number) {
    return chainFetch<{ ok: boolean; rate: number; message: string }>(
      "/admin/reward-rate",
      {
        method: "POST",
        body: JSON.stringify({ rate }),
      },
    );
  }
  updateTreasuryWallet(address: string) {
    return chainFetch<{ ok: boolean; address: string; message: string }>(
      "/admin/treasury",
      {
        method: "POST",
        body: JSON.stringify({ address }),
      },
    );
  }
  updateFee(feeBps: number) {
    return chainFetch<{ ok: boolean; feeBps: number; message: string }>(
      "/admin/fee",
      {
        method: "POST",
        body: JSON.stringify({ feeBps }),
      },
    );
  }
  emergencyWithdraw() {
    return chainFetch<TxActionResult>("/admin/emergency-withdraw", {
      method: "POST",
      body: "{}",
    });
  }
  reindexTransactions() {
    return chainFetch<{ ok: boolean; indexed: number }>("/admin/reindex", {
      method: "POST",
      body: "{}",
    });
  }
  reconnectRpc() {
    return chainFetch<{ ok: boolean; latencyMs: number }>(
      "/admin/reconnect-rpc",
      { method: "POST", body: "{}" },
    );
  }
}
