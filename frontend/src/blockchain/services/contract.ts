"use client";

import {
  Contract,
  JsonRpcProvider,
  formatEther,
  parseEther,
  type ContractTransactionResponse,
  type InterfaceAbi,
} from "ethers";
import DemoVaultAbi from "../abi/DemoVault.json";
import {
  CONTRACT_ADDRESS,
  CONTRACT_VERSION,
  EXPLORER_URL,
  NETWORK,
  RPC,
  explorerTx,
  isContractConfigured,
} from "../config/contract";
import type { TxLifecycleStage, TxProgress } from "../types/tx-lifecycle";
import { walletManager } from "./wallet";

export type ProgressCallback = (progress: TxProgress) => void;

/**
 * Sole module that talks to DemoVault via ethers.js.
 * Pages / hooks must call this — never Contract directly.
 */
class ContractService {
  private readProvider = new JsonRpcProvider(RPC);

  isReady(): boolean {
    return isContractConfigured();
  }

  getAddress(): string {
    return CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
  }

  private readContract() {
    if (!this.isReady()) {
      throw new Error(
        "CONTRACT_ADDRESS is empty. Deploy DemoVault on BNB Testnet and set NEXT_PUBLIC_CONTRACT_ADDRESS.",
      );
    }
    return new Contract(
      CONTRACT_ADDRESS,
      DemoVaultAbi as InterfaceAbi,
      this.readProvider,
    );
  }

  private async writeContract() {
    if (!this.isReady()) {
      throw new Error(
        "CONTRACT_ADDRESS is empty. Deploy DemoVault on BNB Testnet and set NEXT_PUBLIC_CONTRACT_ADDRESS.",
      );
    }
    const signer = await walletManager.getSigner();
    return new Contract(CONTRACT_ADDRESS, DemoVaultAbi as InterfaceAbi, signer);
  }

  private async runTx(
    label: string,
    send: () => Promise<ContractTransactionResponse>,
    onProgress?: ProgressCallback,
  ): Promise<{ hash: string; status: "success" | "failed"; explorerUrl: string; message: string }> {
    const emit = (stage: TxLifecycleStage, extra?: Partial<TxProgress>) => {
      onProgress?.({ stage, ...extra });
    };

    try {
      emit("preparing", { message: `Preparing ${label}…` });
      emit("wallet_confirmation", {
        message: "Confirm the transaction in your wallet…",
      });

      const tx = await send();

      emit("broadcasting", {
        hash: tx.hash,
        explorerUrl: explorerTx(tx.hash),
        message: "Broadcasting to BNB Testnet…",
      });

      emit("waiting_for_block", {
        hash: tx.hash,
        explorerUrl: explorerTx(tx.hash),
        message: "Waiting for block confirmation…",
      });

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        emit("failed", {
          hash: tx.hash,
          explorerUrl: explorerTx(tx.hash),
          error: "Transaction reverted on-chain",
        });
        return {
          hash: tx.hash,
          status: "failed",
          explorerUrl: explorerTx(tx.hash),
          message: `${label} failed on-chain`,
        };
      }

      emit("confirmed", {
        hash: tx.hash,
        explorerUrl: explorerTx(tx.hash),
        message: "Confirmed in block",
      });
      emit("completed", {
        hash: tx.hash,
        explorerUrl: explorerTx(tx.hash),
        message: `${label} completed`,
      });

      return {
        hash: tx.hash,
        status: "success",
        explorerUrl: explorerTx(tx.hash),
        message: `${label} completed`,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      emit("failed", { error: message, message });
      throw e;
    }
  }

  async deposit(amountEth: number, onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx(
      "Deposit",
      () => c.deposit({ value: parseEther(String(amountEth)) }),
      onProgress,
    );
  }

  async withdraw(amountEth: number, onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx(
      "Withdraw",
      () => c.withdraw(parseEther(String(amountEth))),
      onProgress,
    );
  }

  async claimRewards(onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx("Claim", () => c.claimRewards(), onProgress);
  }

  async compound(onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx("Compound", () => c.compoundRewards(), onProgress);
  }

  async pause(onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx("Pause", () => c.pause(), onProgress);
  }

  async unpause(onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx("Unpause", () => c.unpause(), onProgress);
  }

  async balanceOf(address: string): Promise<number> {
    const c = this.readContract();
    const v = await c.balanceOf(address);
    return Number(formatEther(v));
  }

  async pendingRewards(address: string): Promise<number> {
    const c = this.readContract();
    const v = await c.pendingRewards(address);
    return Number(formatEther(v));
  }

  async contractBalance(): Promise<number> {
    const c = this.readContract();
    const v = await c.contractBalance();
    return Number(formatEther(v));
  }

  async totalDeposited(): Promise<number> {
    const c = this.readContract();
    const v = await c.totalDeposited();
    return Number(formatEther(v));
  }

  async totalWithdrawn(): Promise<number> {
    const c = this.readContract();
    const v = await c.totalWithdrawn();
    return Number(formatEther(v));
  }

  async totalUsers(): Promise<number> {
    const c = this.readContract();
    const v = await c.totalUsers();
    return Number(v);
  }

  async totalRewardsPaid(): Promise<number> {
    const c = this.readContract();
    const v = await c.totalRewardsPaid();
    return Number(formatEther(v));
  }

  async owner(): Promise<string> {
    const c = this.readContract();
    return (await c.owner()) as string;
  }

  async paused(): Promise<boolean> {
    const c = this.readContract();
    return Boolean(await c.paused());
  }

  async version(): Promise<string> {
    try {
      const c = this.readContract();
      return (await c.VERSION()) as string;
    } catch {
      return CONTRACT_VERSION;
    }
  }

  async getOnChainSnapshot(userAddress?: string | null) {
    if (!this.isReady()) {
      return null;
    }
    const [
      contractBal,
      deposited,
      withdrawn,
      users,
      rewardsPaid,
      owner,
      paused,
      version,
    ] = await Promise.all([
      this.contractBalance(),
      this.totalDeposited(),
      this.totalWithdrawn(),
      this.totalUsers(),
      this.totalRewardsPaid(),
      this.owner(),
      this.paused(),
      this.version(),
    ]);

    let investmentBalance = 0;
    let pending = 0;
    if (userAddress) {
      [investmentBalance, pending] = await Promise.all([
        this.balanceOf(userAddress),
        this.pendingRewards(userAddress),
      ]);
    }

    return {
      contractBalance: contractBal,
      totalDeposited: deposited,
      totalWithdrawn: withdrawn,
      totalUsers: users,
      totalRewardsPaid: rewardsPaid,
      owner,
      paused,
      version,
      investmentBalance,
      pendingRewards: pending,
      network: NETWORK,
      explorerBaseUrl: EXPLORER_URL,
      contractAddress: this.getAddress(),
    };
  }

  getReadProvider() {
    return this.readProvider;
  }

  getAbi() {
    return DemoVaultAbi as InterfaceAbi;
  }
}

export const contractService = new ContractService();
