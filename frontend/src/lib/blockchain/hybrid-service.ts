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
  NATIVE_SYMBOL,
} from "@/blockchain/services/blockchain";
import type { ProgressCallback } from "@/blockchain/services/contract";
import {
  ApiBlockchainService,
  type IBlockchainService,
} from "./blockchain-service";
import type {
  ContractStats,
  DashboardPayload,
  TxActionResult,
} from "./types";

/**
 * Live Polygon Amoy provider — DemoVaultV2 via ethers.
 * Charts/admin extras still merge API cache when useful; core cards/tables are on-chain.
 */
export class HybridBlockchainService implements IBlockchainService {
  private api = new ApiBlockchainService();
  private progress: ProgressCallback | undefined;

  setProgressHandler(cb?: ProgressCallback) {
    this.progress = cb;
  }

  connectWallet() {
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
    return getContractInfo();
  }

  async getContractBalance() {
    if (isContractConfigured()) {
      try {
        const balance = await contractService.contractBalance();
        return { balance, balanceUsd: 0, symbol: NATIVE_SYMBOL };
      } catch {
        /* fall through */
      }
    }
    const b = await this.api.getContractBalance();
    return { ...b, symbol: NATIVE_SYMBOL };
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
    if (!isContractConfigured()) {
      return Promise.reject(
        new Error("Contract address not set (NEXT_PUBLIC_CONTRACT_ADDRESS)"),
      );
    }
    return deposit(amount, this.progress);
  }

  withdraw(amount: number) {
    if (!isContractConfigured()) {
      return Promise.reject(
        new Error("Contract address not set (NEXT_PUBLIC_CONTRACT_ADDRESS)"),
      );
    }
    return withdraw(amount, this.progress);
  }

  claim() {
    if (!isContractConfigured()) {
      return Promise.reject(
        new Error("Contract address not set (NEXT_PUBLIC_CONTRACT_ADDRESS)"),
      );
    }
    return claimReward(this.progress);
  }

  compound() {
    return compound();
  }

  async getTransactions(params?: Parameters<IBlockchainService["getTransactions"]>[0]) {
    if (isContractConfigured()) {
      try {
        const live = await getTransactions();
        let items = live.items;
        if (params?.type) items = items.filter((r) => r.type === params.type);
        if (params?.status)
          items = items.filter((r) => r.status === params.status);
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
      } catch {
        /* fall through */
      }
    }
    return this.api.getTransactions(params);
  }

  getStatistics() {
    return this.api.getStatistics();
  }

  async getEvents() {
    if (isContractConfigured()) {
      try {
        return await getContractEvents();
      } catch {
        /* fall through */
      }
    }
    return this.api.getEvents();
  }

  async getActivity() {
    if (isContractConfigured()) {
      try {
        return await getActivity();
      } catch {
        /* fall through */
      }
    }
    return this.api.getActivity();
  }

  async getInvestors(params?: Parameters<IBlockchainService["getInvestors"]>[0]) {
    if (isContractConfigured()) {
      try {
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
      } catch {
        /* fall through */
      }
    }
    return this.api.getInvestors(params);
  }

  getNotifications() {
    return this.api.getNotifications();
  }

  async getDashboard(): Promise<DashboardPayload> {
    const base = await this.api.getDashboard();
    try {
      // Prefer NEXT_PUBLIC_CONTRACT_ADDRESS; API config is optional supplement
      applyRuntimeContractConfig({
        contractAddress:
          process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
          base.contract.contractAddress,
        explorerUrl: base.contract.explorerBaseUrl,
      });

      const wallet = await getWallet();
      const contract = await getContractInfo();
      let stats = { ...base.stats, symbol: NATIVE_SYMBOL };
      let activity = base.activity;
      let transactions = base.transactions;
      let events = base.events;
      let investors = base.investors;

      if (isContractConfigured()) {
        const snap = await contractService.getOnChainSnapshot(wallet.address);
        if (snap) {
          stats = {
            ...stats,
            symbol: NATIVE_SYMBOL,
            contractBalance: snap.contractBalance,
            contractBalanceUsd: 0,
            tvl: snap.contractBalance,
            totalDeposits: snap.totalDeposited,
            totalWithdrawals: snap.totalWithdrawn,
            activeInvestors: snap.totalUsers,
            totalRewardsDistributed: snap.totalRewardsPaid,
          };
          if (base.admin) {
            base.admin = {
              ...base.admin,
              contractBalance: snap.contractBalance,
              currentNetwork: snap.network,
              ownerAddress: snap.owner,
              contractVersion: snap.version,
            };
          }
        }

        try {
          const liveTx = await getTransactions();
          transactions = liveTx.items;
          activity = await getActivity();
          events = await getContractEvents();
          const inv = await getInvestors();
          investors = inv.items;
        } catch {
          /* keep mock tables if RPC event query fails */
        }
      }

      return {
        ...base,
        wallet,
        contract,
        stats,
        activity,
        transactions,
        events,
        investors,
      };
    } catch {
      return { ...base, stats: { ...base.stats, symbol: NATIVE_SYMBOL } };
    }
  }

  async getContractStats(): Promise<ContractStats> {
    const dash = await this.getDashboard();
    return dash.stats;
  }

  getAdmin() {
    return this.api.getAdmin();
  }

  getHealth() {
    return this.api.getHealth();
  }

  sync() {
    return this.api.sync();
  }

  async pauseContract() {
    if (isContractConfigured()) {
      try {
        await contractService.pause(this.progress);
        return { ok: true, paused: true, message: "Contract paused on-chain" };
      } catch (e) {
        return {
          ok: false,
          paused: false,
          message: e instanceof Error ? e.message : "Pause failed",
        };
      }
    }
    return this.api.pauseContract();
  }

  async unpauseContract() {
    if (isContractConfigured()) {
      try {
        await contractService.unpause(this.progress);
        return { ok: true, paused: false, message: "Contract unpaused on-chain" };
      } catch (e) {
        return {
          ok: false,
          paused: true,
          message: e instanceof Error ? e.message : "Unpause failed",
        };
      }
    }
    return this.api.unpauseContract();
  }

  updateRewardRate(rate: number) {
    return this.api.updateRewardRate(rate);
  }

  updateTreasuryWallet(address: string) {
    return this.api.updateTreasuryWallet(address);
  }

  updateFee(feeBps: number) {
    return this.api.updateFee(feeBps);
  }

  emergencyWithdraw(): Promise<TxActionResult> {
    return this.api.emergencyWithdraw();
  }

  reindexTransactions() {
    return this.api.reindexTransactions();
  }

  reconnectRpc() {
    contractService.resetProvider();
    return this.api.reconnectRpc();
  }
}

export function isHybridService(
  s: IBlockchainService,
): s is HybridBlockchainService {
  return s instanceof HybridBlockchainService;
}
