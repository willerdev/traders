"use client";

/**
 * App-facing blockchain façade (UI → this → ethers → DemoVaultV2 / Polygon Amoy).
 */

import type {
  ActivityItem,
  BlockchainTransaction,
  ContractEvent,
  ContractStatus,
  InvestorRow,
  TxActionResult,
  WalletState,
} from "@/lib/blockchain/types";
import {
  CONTRACT_VERSION,
  NETWORK_LABEL,
  NATIVE_SYMBOL,
  explorerAddress,
  getContractAddress,
  getExplorerUrl,
  isContractConfigured,
  applyRuntimeContractConfig,
  NETWORK,
} from "../config/contract";
import { eventListener, type ChainEventHandler } from "../events/listener";
import { contractService, type ProgressCallback } from "./contract";
import { walletManager } from "./wallet";

export async function connectWallet(): Promise<WalletState> {
  if (!walletManager.isAvailable()) {
    throw new Error("MetaMask (or compatible wallet) is not installed.");
  }
  const { address, balanceEth } = await walletManager.connect();
  eventListener.start();
  return buildWalletState(address, Number(balanceEth));
}

export async function disconnectWallet(): Promise<WalletState> {
  await walletManager.disconnect();
  eventListener.stop();
  return emptyWallet();
}

export async function getCurrentWallet(): Promise<WalletState> {
  return getWallet();
}

export async function getWallet(): Promise<WalletState> {
  const address = walletManager.getAddress();
  if (!address) return emptyWallet();
  const balanceEth = await walletManager.getBalance(address);
  return buildWalletState(address, Number(balanceEth));
}

async function buildWalletState(
  address: string,
  nativeBalance: number,
): Promise<WalletState> {
  let investmentBalance = 0;
  let pendingRewards = 0;
  if (isContractConfigured()) {
    try {
      [investmentBalance, pendingRewards] = await Promise.all([
        contractService.getUserBalance(address),
        contractService.getReward(address),
      ]);
    } catch {
      /* contract / RPC */
    }
  }
  return {
    connected: true,
    address,
    balance: nativeBalance,
    investmentBalance,
    pendingRewards,
    claimableRewards: pendingRewards,
    nextRewardAt: new Date(Date.now() + 3_600_000).toISOString(),
    tier:
      investmentBalance >= 100
        ? "Gold"
        : investmentBalance > 0
          ? "Silver"
          : "Bronze",
    referralEarnings: 0,
    totalDeposited: investmentBalance,
    totalWithdrawn: 0,
    totalProfit: 0,
    provider: "metamask",
  };
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

export async function getContractInfo(): Promise<ContractStatus> {
  const configured = isContractConfigured();
  let paused = false;
  let owner = "0x0000000000000000000000000000000000000000";
  if (configured) {
    try {
      [paused, owner] = await Promise.all([
        contractService.paused(),
        contractService.owner(),
      ]);
    } catch {
      /* RPC */
    }
  }
  return {
    connection: walletManager.getAddress() ? "connected" : "not_connected",
    networkMode: "testnet",
    network: "polygon",
    networkLabel: NETWORK_LABEL,
    contractAddress:
      getContractAddress() || "0x0000000000000000000000000000000000000000",
    explorerBaseUrl: getExplorerUrl(),
    paused,
    owner,
    version: CONTRACT_VERSION,
  };
}

export async function getContractBalance() {
  const balance = await contractService.contractBalance();
  return { balance, balanceUsd: 0, symbol: NATIVE_SYMBOL };
}

function toTxResult(
  r: Awaited<ReturnType<typeof contractService.deposit>>,
): TxActionResult {
  return {
    status: r.status === "success" ? "success" : "failed",
    hash: r.hash,
    message: r.message,
    explorerUrl: r.explorerUrl,
  };
}

export async function deposit(amount: number, onProgress?: ProgressCallback) {
  return toTxResult(await contractService.deposit(amount, onProgress));
}

export async function enroll(onProgress?: ProgressCallback) {
  return toTxResult(await contractService.enroll(onProgress));
}

export async function withdraw(amount: number, onProgress?: ProgressCallback) {
  return toTxResult(await contractService.withdraw(amount, onProgress));
}

export async function claimReward(onProgress?: ProgressCallback) {
  return toTxResult(await contractService.claimReward(onProgress));
}

export async function claimRewards(onProgress?: ProgressCallback) {
  return claimReward(onProgress);
}

/** Rewards accrue via dailyRate — no on-chain compound */
export async function compound(): Promise<TxActionResult> {
  return {
    status: "failed",
    hash: "",
    message: "Compound is not available — rewards accrue from dailyRate",
    explorerUrl: "",
  };
}

export async function balanceOf(address: string) {
  return contractService.getUserBalance(address);
}

export async function pendingRewards(address: string) {
  return contractService.getReward(address);
}

export async function contractBalance() {
  return contractService.contractBalance();
}

export async function totalDeposited() {
  return contractService.totalDeposited();
}

export async function totalUsers() {
  return contractService.userCount();
}

export async function getEvents() {
  return contractService.getEvents();
}

export async function getActivity(): Promise<ActivityItem[]> {
  const events = await contractService.getEvents();
  return events.map((e) => ({
    id: e.id,
    type: e.type,
    wallet: e.wallet,
    amount: e.amount,
    hash: e.hash,
    timestamp: e.timestamp,
    status: e.status,
    explorerUrl: e.explorerUrl,
  }));
}

export async function getTransactions(): Promise<{
  items: BlockchainTransaction[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const events = await contractService.getEvents();
  const items: BlockchainTransaction[] = events.map((e) => ({
    id: e.id,
    wallet: e.wallet,
    type: e.type,
    amount: e.amount,
    networkFee: e.networkFee,
    block: e.block,
    hash: e.hash,
    status: e.status,
    date: e.timestamp,
    explorerUrl: e.explorerUrl,
  }));
  return { items, total: items.length, page: 1, pageSize: items.length || 20 };
}

export async function getContractEvents(): Promise<ContractEvent[]> {
  const events = await contractService.getEvents();
  return events.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    transactionHash: e.hash,
    blockNumber: e.block,
    timestamp: e.timestamp,
    wallet: e.wallet,
    explorerUrl: e.explorerUrl,
  }));
}

export async function getInvestors(): Promise<{
  items: InvestorRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const list = await contractService.listInvestors();
  const items: InvestorRow[] = list.map((r) => ({
    wallet: r.wallet,
    joinedAt: new Date().toISOString(),
    investment: r.investment,
    rewards: r.rewards,
    status: r.investment > 0 ? "active" : "inactive",
    country: "—",
    lastActivity: new Date().toISOString(),
  }));
  return { items, total: items.length, page: 1, pageSize: items.length || 20 };
}

export function subscribeEvents(handler: ChainEventHandler) {
  eventListener.start();
  return eventListener.on(handler);
}

export function getExplorerAddressUrl(address: string) {
  return explorerAddress(address);
}

/** Named service object for UI: blockchainService.getContractBalance() */
export const blockchainService = {
  connectWallet,
  disconnectWallet,
  getCurrentWallet,
  getWallet,
  getContractInfo,
  getContractBalance,
  deposit,
  enroll,
  withdraw,
  claimReward,
  claimRewards,
  compound,
  getEvents,
  getActivity,
  getTransactions,
  getContractEvents,
  getInvestors,
  contractBalance,
  totalDeposited,
  totalUsers,
  balanceOf,
  pendingRewards,
  subscribeEvents,
  isContractConfigured,
  getContractAddress,
};

export {
  contractService,
  walletManager,
  eventListener,
  isContractConfigured,
  applyRuntimeContractConfig,
  NETWORK,
  NATIVE_SYMBOL,
  getContractAddress,
};
