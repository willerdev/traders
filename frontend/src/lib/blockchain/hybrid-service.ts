"use client";

import {
  claimRewards,
  compound,
  connectWallet,
  contractService,
  deposit,
  disconnectWallet,
  getContractInfo,
  getWallet,
  isContractConfigured,
  withdraw,
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
  WalletState,
} from "./types";

/**
 * Hybrid provider: MetaMask + DemoVault (ethers) for wallet/tx/reads,
 * REST mocks/cache for tables, charts, and admin until indexer fills DB.
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
        return { balance, balanceUsd: balance * 600, symbol: "BNB" };
      } catch {
        /* fall through */
      }
    }
    return this.api.getContractBalance();
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
      return this.api.deposit(amount);
    }
    return deposit(amount, this.progress);
  }

  withdraw(amount: number) {
    if (!isContractConfigured()) {
      return this.api.withdraw(amount);
    }
    return withdraw(amount, this.progress);
  }

  claim() {
    if (!isContractConfigured()) {
      return this.api.claim();
    }
    return claimRewards(this.progress);
  }

  compound() {
    if (!isContractConfigured()) {
      return this.api.compound();
    }
    return compound(this.progress);
  }

  getTransactions(params?: Parameters<IBlockchainService["getTransactions"]>[0]) {
    return this.api.getTransactions(params);
  }

  getStatistics() {
    return this.api.getStatistics();
  }

  getEvents() {
    return this.api.getEvents();
  }

  getActivity() {
    return this.api.getActivity();
  }

  getInvestors(params?: Parameters<IBlockchainService["getInvestors"]>[0]) {
    return this.api.getInvestors(params);
  }

  getNotifications() {
    return this.api.getNotifications();
  }

  async getDashboard(): Promise<DashboardPayload> {
    const base = await this.api.getDashboard();
    try {
      const wallet = await getWallet();
      const contract = await getContractInfo();
      let stats = base.stats;

      if (isContractConfigured()) {
        const snap = await contractService.getOnChainSnapshot(wallet.address);
        if (snap) {
          stats = {
            ...stats,
            contractBalance: snap.contractBalance,
            contractBalanceUsd: snap.contractBalance * 600,
            tvl: snap.contractBalance,
            totalDeposits: Math.round(snap.totalDeposited),
            totalWithdrawals: Math.round(snap.totalWithdrawn),
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
              totalFeesCollected: base.admin.totalFeesCollected,
            };
          }
        }
      }

      return {
        ...base,
        wallet,
        contract,
        stats,
      };
    } catch {
      return base;
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

  pauseContract() {
    return this.api.pauseContract();
  }

  unpauseContract() {
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
    return this.api.reconnectRpc();
  }
}

export function isHybridService(
  s: IBlockchainService,
): s is HybridBlockchainService {
  return s instanceof HybridBlockchainService;
}
