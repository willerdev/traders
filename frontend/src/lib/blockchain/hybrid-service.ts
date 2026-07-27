"use client";

import {
  claimReward,
  compound,
  connectWallet,
  contractService,
  deposit,
  disconnectWallet,
  getActivity,
  getContractEvents,
  getContractInfo,
  getInvestors,
  getTransactions,
  getWallet,
  isContractConfigured,
  applyRuntimeContractConfig,
  withdraw,
  getContractAddress,
  NATIVE_SYMBOL,
} from "@/blockchain/services/blockchain";
import {
  CONTRACT_VERSION,
  NETWORK_LABEL,
  getExplorerUrl,
  getRpcUrl,
} from "@/blockchain/config/contract";
import type { ProgressCallback } from "@/blockchain/services/contract";
import type { IBlockchainService } from "./blockchain-service";
import type {
  ActivityItem,
  AdminDashboard,
  BlockchainNotification,
  BlockchainTransaction,
  ChartPoint,
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

function requireContract() {
  applyRuntimeContractConfig({
    contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 80002),
    rpc: process.env.NEXT_PUBLIC_RPC_URL,
    explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL,
  });
  if (!isContractConfigured()) {
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ADDRESS is not set. Add it on Render traders-web and redeploy.",
    );
  }
}

function emptyWallet(): WalletState {
  return {
    connected: false,
    address: null,
    balance: 0,
    investmentBalance: 0,
    pendingRewards: 0,
    claimableRewards: 0,
    nextRewardAt: new Date(Date.now() + 3_600_000).toISOString(),
    tier: "—",
    referralEarnings: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalProfit: 0,
    provider: null,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function seriesFromEvents(
  events: { timestamp: string; amount: number; type: string }[],
  type: string,
  days = 14,
): ChartPoint[] {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) map.set(daysAgo(i), 0);
  for (const e of events) {
    if (e.type !== type) continue;
    const day = e.timestamp.slice(0, 10);
    if (map.has(day)) map.set(day, (map.get(day) || 0) + e.amount);
  }
  return [...map.entries()].map(([date, value]) => ({
    date,
    value: Math.round(value * 1e6) / 1e6,
  }));
}

function buildStatistics(activity: ActivityItem[]): InvestmentStatistics {
  return {
    dailyDeposits: seriesFromEvents(activity, "deposit"),
    dailyWithdrawals: seriesFromEvents(activity, "withdrawal"),
    tvlGrowth: seriesFromEvents(activity, "deposit").map((p, i, arr) => ({
      date: p.date,
      value: arr.slice(0, i + 1).reduce((s, x) => s + x.value, 0),
    })),
    userGrowth: Array.from({ length: 14 }, (_, i) => ({
      date: daysAgo(13 - i),
      value: 0,
    })),
    rewardsPaid: seriesFromEvents(activity, "claim"),
    profitDistribution: seriesFromEvents(activity, "referral_bonus"),
    monthlyComparison: [],
    networkActivity: seriesFromEvents(activity, "deposit").map((p, i) => ({
      date: p.date,
      value:
        (seriesFromEvents(activity, "deposit")[i]?.value || 0) +
        (seriesFromEvents(activity, "withdrawal")[i]?.value || 0) +
        (seriesFromEvents(activity, "claim")[i]?.value || 0),
    })),
  };
}

/**
 * Live-only blockchain service — no mock dashboard data.
 * UI → this → ethers → DemoVaultV2 on Polygon Amoy.
 */
export class HybridBlockchainService implements IBlockchainService {
  private progress: ProgressCallback | undefined;

  setProgressHandler(cb?: ProgressCallback) {
    this.progress = cb;
  }

  connectWallet() {
    requireContract();
    return connectWallet();
  }

  disconnectWallet() {
    return disconnectWallet();
  }

  getWallet() {
    return getWallet();
  }

  async getNetwork() {
    const c = await getContractInfo();
    return {
      network: c.network,
      networkLabel: c.networkLabel,
      networkMode: c.networkMode,
      explorerBaseUrl: c.explorerBaseUrl,
    };
  }

  getContractInfo() {
    requireContract();
    return getContractInfo();
  }

  async getContractBalance() {
    requireContract();
    const balance = await contractService.contractBalance();
    return { balance, balanceUsd: 0, symbol: NATIVE_SYMBOL };
  }

  async getUserBalance() {
    const w = await getWallet();
    return {
      walletBalance: w.balance,
      investmentBalance: w.investmentBalance,
    };
  }

  async getRewards() {
    const w = await getWallet();
    return {
      pendingRewards: w.pendingRewards,
      claimableRewards: w.claimableRewards,
      nextRewardAt: w.nextRewardAt,
    };
  }

  deposit(amount: number) {
    requireContract();
    return deposit(amount, this.progress);
  }

  withdraw(amount: number) {
    requireContract();
    return withdraw(amount, this.progress);
  }

  claim() {
    requireContract();
    return claimReward(this.progress);
  }

  compound() {
    return compound();
  }

  async getTransactions(params?: Parameters<IBlockchainService["getTransactions"]>[0]) {
    requireContract();
    const live = await getTransactions();
    let items = live.items;
    if (params?.type) items = items.filter((r) => r.type === params.type);
    if (params?.status) items = items.filter((r) => r.status === params.status);
    if (params?.q) {
      const q = params.q.toLowerCase();
      items = items.filter(
        (r) =>
          r.wallet.toLowerCase().includes(q) ||
          r.hash.toLowerCase().includes(q),
      );
    }
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }

  async getStatistics() {
    requireContract();
    const activity = await getActivity();
    return buildStatistics(activity);
  }

  async getEvents() {
    requireContract();
    return getContractEvents();
  }

  async getActivity() {
    requireContract();
    return getActivity();
  }

  async getInvestors(params?: Parameters<IBlockchainService["getInvestors"]>[0]) {
    requireContract();
    const live = await getInvestors();
    let items = live.items;
    if (params?.q) {
      const q = params.q.toLowerCase();
      items = items.filter((r) => r.wallet.toLowerCase().includes(q));
    }
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }

  async getNotifications(): Promise<BlockchainNotification[]> {
    requireContract();
    const activity = await getActivity();
    return activity.slice(0, 10).map((a) => ({
      id: a.id,
      type: a.type,
      title: a.type.replace(/_/g, " "),
      message: `${a.amount} ${NATIVE_SYMBOL} · ${a.wallet.slice(0, 10)}…`,
      createdAt: a.timestamp,
      read: false,
      severity: "info" as const,
    }));
  }

  async getDashboard(): Promise<DashboardPayload> {
    requireContract();
    applyRuntimeContractConfig({
      contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
      chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 80002),
      rpc: process.env.NEXT_PUBLIC_RPC_URL || getRpcUrl(),
      explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || getExplorerUrl(),
    });

    const wallet = await getWallet().catch(() => emptyWallet());
    const contract = await getContractInfo();
    const snap = await contractService.getOnChainSnapshot(wallet.address);

    if (!snap) {
      throw new Error("Unable to read DemoVaultV2 — check RPC and contract address");
    }

    let activity: ActivityItem[] = [];
    let transactions: BlockchainTransaction[] = [];
    let events: ContractEvent[] = [];
    let investors: InvestorRow[] = [];

    try {
      const liveTx = await getTransactions();
      transactions = liveTx.items;
      activity = await getActivity();
      events = await getContractEvents();
      investors = (await getInvestors()).items;
    } catch (e) {
      console.warn("[LiveBlockchain] event query failed", e);
    }

    let latestBlock = 0;
    let gasCurrent = 0;
    try {
      const provider = contractService.getReadProvider();
      latestBlock = await provider.getBlockNumber();
      const fee = await provider.getFeeData();
      gasCurrent = fee.gasPrice ? Number(fee.gasPrice) / 1e9 : 0;
    } catch {
      /* RPC soft-fail for gas/block only */
    }

    const stats: ContractStats = {
      contractBalance: snap.contractBalance,
      contractBalanceUsd: 0,
      symbol: NATIVE_SYMBOL,
      tvl: snap.contractBalance,
      totalDeposits: snap.totalDeposited,
      totalWithdrawals: snap.totalWithdrawn,
      activeInvestors: snap.totalUsers,
      totalRewardsDistributed: snap.totalRewardsPaid,
      gas: {
        current: Math.round(gasCurrent * 1000) / 1000,
        average: Math.round(gasCurrent * 1000) / 1000,
        high: Math.round(gasCurrent * 1.5 * 1000) / 1000,
      },
      latestBlock,
      currentApy: 0,
      totalFeesCollected: 0,
    };

    const admin: AdminDashboard = {
      contractBalance: snap.contractBalance,
      pendingWithdrawals: 0,
      pendingDeposits: 0,
      usersOnline: 0,
      dailyRevenue: 0,
      weeklyRevenue: 0,
      monthlyRevenue: 0,
      totalFeesCollected: 0,
      currentApy: 0,
      contractVersion: snap.version || CONTRACT_VERSION,
      currentNetwork: NETWORK_LABEL,
      ownerAddress: snap.owner,
      treasuryWallet: snap.owner,
      reserveWallet: snap.owner,
      emergencyWallet: snap.owner,
    };

    const health: ContractHealth = {
      healthScore: contract.paused ? 40 : 95,
      liquidityRatio: snap.contractBalance > 0 ? 1 : 0,
      reserveRatio: 0,
      rewardSustainability: 0,
      pendingClaims: 0,
      averageClaimTimeHours: 0,
      averageDeposit:
        snap.totalUsers > 0 ? snap.totalDeposited / snap.totalUsers : 0,
      averageWithdrawal:
        snap.totalUsers > 0 ? snap.totalWithdrawn / snap.totalUsers : 0,
      rpcLatencyMs: 0,
      blockDelay: 0,
      lastSynchronization: new Date().toISOString(),
      blockchainStatus: "healthy",
      databaseStatus: "healthy",
      apiStatus: "healthy",
      walletServiceStatus: wallet.connected ? "healthy" : "degraded",
      explorerStatus: "healthy",
    };

    const notifications = (await this.getNotifications().catch(() => [])) as BlockchainNotification[];

    return {
      contract: {
        ...contract,
        contractAddress: getContractAddress(),
        explorerBaseUrl: getExplorerUrl(),
        networkLabel: NETWORK_LABEL,
        network: "polygon",
        version: snap.version || CONTRACT_VERSION,
        paused: snap.paused,
        owner: snap.owner,
      } satisfies ContractStatus,
      stats,
      wallet,
      activity,
      statistics: buildStatistics(activity),
      transactions,
      investors,
      events,
      notifications,
      admin,
      health,
    };
  }

  async getContractStats(): Promise<ContractStats> {
    const dash = await this.getDashboard();
    return dash.stats;
  }

  async getAdmin(): Promise<AdminDashboard> {
    const dash = await this.getDashboard();
    if (!dash.admin) throw new Error("Admin snapshot unavailable");
    return dash.admin;
  }

  async getHealth(): Promise<ContractHealth> {
    const dash = await this.getDashboard();
    if (!dash.health) throw new Error("Health snapshot unavailable");
    return dash.health;
  }

  async sync() {
    requireContract();
    contractService.resetProvider();
    const events = await getContractEvents();
    return {
      ok: true,
      lastSynchronization: new Date().toISOString(),
      message: `Synced ${events.length} on-chain events from Polygon Amoy`,
    };
  }

  async pauseContract() {
    requireContract();
    await contractService.pause(this.progress);
    return { ok: true, paused: true, message: "Contract paused on-chain" };
  }

  async unpauseContract() {
    requireContract();
    await contractService.unpause(this.progress);
    return { ok: true, paused: false, message: "Contract unpaused on-chain" };
  }

  async updateRewardRate(_rate: number) {
    return {
      ok: false,
      rate: _rate,
      message: "Reward rate is managed via addReward() on DemoVaultV2 (owner only)",
    };
  }

  async updateTreasuryWallet(_address: string) {
    return {
      ok: false,
      address: _address,
      message: "Treasury wallet update is not exposed on DemoVaultV2",
    };
  }

  async updateFee(_feeBps: number) {
    return {
      ok: false,
      feeBps: _feeBps,
      message: "Fee updates are not exposed on DemoVaultV2",
    };
  }

  async emergencyWithdraw(): Promise<TxActionResult> {
    requireContract();
    // Owner-only on contract; surface clear error if unauthorized
    try {
      const c = await (contractService as unknown as {
        writeEmergency?: () => Promise<TxActionResult>;
      });
      void c;
      return {
        status: "failed",
        hash: "",
        message:
          "Use Remix/owner wallet for emergencyWithdraw on DemoVaultV2, or call via owner account",
        explorerUrl: "",
      };
    } catch (e) {
      return {
        status: "failed",
        hash: "",
        message: e instanceof Error ? e.message : "Emergency withdraw failed",
        explorerUrl: "",
      };
    }
  }

  async reindexTransactions() {
    requireContract();
    const events = await getContractEvents();
    return { ok: true, indexed: events.length };
  }

  async reconnectRpc() {
    contractService.resetProvider();
    const started = Date.now();
    await contractService.getReadProvider().getBlockNumber();
    return { ok: true, latencyMs: Date.now() - started };
  }
}

export function isHybridService(
  s: IBlockchainService,
): s is HybridBlockchainService {
  return s instanceof HybridBlockchainService;
}
