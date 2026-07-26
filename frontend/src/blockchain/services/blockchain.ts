"use client";

/**
 * App-facing blockchain façade.
 * UI → this file → walletManager / contractService / eventListener.
 * Never call ethers Contract from pages.
 */

import type {
  ContractStatus,
  TxActionResult,
  WalletState,
} from "@/lib/blockchain/types";
import {
  applyRuntimeContractConfig,
  CONTRACT_VERSION,
  getContractAddress,
  getExplorerUrl,
  isContractConfigured,
  NETWORK,
  NETWORK_LABEL,
  NATIVE_SYMBOL,
  explorerAddress,
} from "../config/contract";
import { eventListener, type ChainEventHandler } from "../events/listener";
import { contractService, type ProgressCallback } from "./contract";
import { walletManager } from "./wallet";

export async function connectWallet(): Promise<WalletState> {
  const { address, balanceEth } = await walletManager.connect();
  eventListener.start();

  let investmentBalance = 0;
  let pendingRewards = 0;
  if (isContractConfigured()) {
    try {
      investmentBalance = await contractService.balanceOf(address);
      pendingRewards = await contractService.pendingRewards(address);
    } catch {
      /* contract not deployed yet */
    }
  }

  return {
    connected: true,
    address,
    balance: Number(balanceEth),
    investmentBalance,
    pendingRewards,
    claimableRewards: pendingRewards,
    nextRewardAt: new Date(Date.now() + 3_600_000).toISOString(),
    tier: investmentBalance >= 100 ? "Gold" : investmentBalance > 0 ? "Silver" : "Bronze",
    referralEarnings: 0,
    totalDeposited: investmentBalance,
    totalWithdrawn: 0,
    totalProfit: 0,
    provider: "metamask",
  };
}

export async function disconnectWallet(): Promise<WalletState> {
  await walletManager.disconnect();
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

export async function getWallet(): Promise<WalletState> {
  const address = walletManager.getAddress();
  if (!address) {
    return disconnectWallet();
  }
  const balanceEth = await walletManager.getBalance(address);
  let investmentBalance = 0;
  let pendingRewards = 0;
  if (isContractConfigured()) {
    try {
      investmentBalance = await contractService.balanceOf(address);
      pendingRewards = await contractService.pendingRewards(address);
    } catch {
      /* ignore */
    }
  }
  return {
    connected: true,
    address,
    balance: Number(balanceEth),
    investmentBalance,
    pendingRewards,
    claimableRewards: pendingRewards,
    nextRewardAt: new Date(Date.now() + 3_600_000).toISOString(),
    tier: investmentBalance >= 100 ? "Gold" : investmentBalance > 0 ? "Silver" : "Bronze",
    referralEarnings: 0,
    totalDeposited: investmentBalance,
    totalWithdrawn: 0,
    totalProfit: 0,
    provider: "metamask",
  };
}

export async function getContractInfo(): Promise<ContractStatus> {
  const configured = isContractConfigured();
  let paused = false;
  let owner = "0x0000000000000000000000000000000000000000";
  let version = CONTRACT_VERSION;
  if (configured) {
    try {
      [paused, owner, version] = await Promise.all([
        contractService.paused(),
        contractService.owner(),
        contractService.version(),
      ]);
    } catch {
      /* RPC / undeployed */
    }
  }
  return {
    connection: walletManager.getAddress() ? "connected" : "not_connected",
    networkMode: "testnet",
    network: "bnb",
    networkLabel: NETWORK_LABEL,
    contractAddress: getContractAddress() || "0x0000000000000000000000000000000000000000",
    explorerBaseUrl: getExplorerUrl(),
    paused,
    owner,
    version,
  };
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

export async function withdraw(amount: number, onProgress?: ProgressCallback) {
  return toTxResult(await contractService.withdraw(amount, onProgress));
}

export async function claimRewards(onProgress?: ProgressCallback) {
  return toTxResult(await contractService.claimRewards(onProgress));
}

export async function compound(onProgress?: ProgressCallback) {
  return toTxResult(await contractService.compound(onProgress));
}

export async function balanceOf(address: string) {
  return contractService.balanceOf(address);
}

export async function pendingRewards(address: string) {
  return contractService.pendingRewards(address);
}

export async function contractBalance() {
  return contractService.contractBalance();
}

export async function totalDeposited() {
  return contractService.totalDeposited();
}

export async function totalUsers() {
  return contractService.totalUsers();
}

export function subscribeEvents(handler: ChainEventHandler) {
  eventListener.start();
  return eventListener.on(handler);
}

export function getExplorerAddressUrl(address: string) {
  return explorerAddress(address);
}

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
