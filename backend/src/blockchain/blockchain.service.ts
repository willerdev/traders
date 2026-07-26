import { Injectable } from '@nestjs/common';
import {
  getMockActivity,
  getMockAdmin,
  getMockContractStats,
  getMockContractStatus,
  getMockDashboard,
  getMockEvents,
  getMockHealth,
  getMockInvestors,
  getMockNotifications,
  getMockStatistics,
  getMockTransactions,
  getMockWallet,
  mockClaim,
  mockCompound,
  mockConnectWallet,
  mockDeposit,
  mockDisconnectWallet,
  mockWithdraw,
} from './mock-data';
import type {
  DashboardPayload,
  TxActionResult,
  WalletState,
} from './blockchain.types';

/**
 * Nest façade over mock chain data.
 * Later: inject a provider that calls the Solidity contract via ethers/viem
 * while keeping the same method signatures for controllers and the frontend.
 */
@Injectable()
export class BlockchainService {
  async connectWallet(): Promise<WalletState> {
    await delay();
    return mockConnectWallet();
  }

  async disconnectWallet(): Promise<WalletState> {
    await delay();
    return mockDisconnectWallet();
  }

  async getWallet(): Promise<WalletState> {
    await delay(80);
    return getMockWallet();
  }

  async getNetwork() {
    await delay(60);
    const c = getMockContractStatus();
    return {
      network: c.network,
      networkLabel: c.networkLabel,
      networkMode: c.networkMode,
      explorerBaseUrl: c.explorerBaseUrl,
    };
  }

  async getContractInfo() {
    await delay(80);
    return getMockContractStatus();
  }

  async getContractBalance() {
    await delay(80);
    const s = getMockContractStats();
    return {
      balance: s.contractBalance,
      balanceUsd: s.contractBalanceUsd,
      symbol: s.symbol,
    };
  }

  async getUserBalance() {
    await delay(80);
    const w = getMockWallet();
    return {
      walletBalance: w.balance,
      investmentBalance: w.investmentBalance,
    };
  }

  async getRewards() {
    await delay(80);
    const w = getMockWallet();
    return {
      pendingRewards: w.pendingRewards,
      claimableRewards: w.claimableRewards,
      nextRewardAt: w.nextRewardAt,
    };
  }

  async deposit(amount: number): Promise<TxActionResult> {
    await delay(200);
    return mockDeposit(amount);
  }

  async withdraw(amount: number): Promise<TxActionResult> {
    await delay(200);
    return mockWithdraw(amount);
  }

  async claim(): Promise<TxActionResult> {
    await delay(200);
    return mockClaim();
  }

  async compound(): Promise<TxActionResult> {
    await delay(200);
    return mockCompound();
  }

  async getTransactions() {
    await delay(100);
    return getMockTransactions();
  }

  async getStatistics() {
    await delay(100);
    return getMockStatistics();
  }

  async getEvents() {
    await delay(100);
    return getMockEvents();
  }

  async getActivity() {
    await delay(100);
    return getMockActivity();
  }

  async getInvestors() {
    await delay(100);
    return getMockInvestors();
  }

  async getNotifications() {
    await delay(80);
    return getMockNotifications();
  }

  async getAdminDashboard() {
    await delay(100);
    return getMockAdmin();
  }

  async getHealth() {
    await delay(100);
    return getMockHealth();
  }

  async getContractStats() {
    await delay(80);
    return getMockContractStats();
  }

  async getDashboard(isAdmin: boolean): Promise<DashboardPayload> {
    await delay(120);
    return getMockDashboard(isAdmin);
  }

  async sync() {
    await delay(300);
    return {
      ok: true,
      lastSynchronization: new Date().toISOString(),
      message: 'Mock sync complete. Wire RPC + indexer when the contract is live.',
    };
  }

  async pauseContract() {
    await delay(150);
    return { ok: true, paused: true, message: 'Mock: contract paused.' };
  }

  async unpauseContract() {
    await delay(150);
    return { ok: true, paused: false, message: 'Mock: contract unpaused.' };
  }

  async updateRewardRate(rate: number) {
    await delay(150);
    return { ok: true, rate, message: 'Mock: reward rate updated.' };
  }

  async updateTreasuryWallet(address: string) {
    await delay(150);
    return { ok: true, address, message: 'Mock: treasury wallet updated.' };
  }

  async updateFee(feeBps: number) {
    await delay(150);
    return { ok: true, feeBps, message: 'Mock: fee updated.' };
  }

  async emergencyWithdraw() {
    await delay(200);
    return mockWithdraw(0);
  }

  async reindexTransactions() {
    await delay(250);
    return { ok: true, indexed: getMockTransactions().length };
  }

  async reconnectRpc() {
    await delay(200);
    return { ok: true, latencyMs: 84 };
  }
}

function delay(ms = 120) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
