"use client";

import {
  Contract,
  JsonRpcProvider,
  formatEther,
  parseEther,
  type ContractTransactionResponse,
  type InterfaceAbi,
  type Log,
} from "ethers";
import DemoVaultV2Abi from "../abi/DemoVaultV2.json";
import {
  CONTRACT_VERSION,
  NETWORK,
  NATIVE_SYMBOL,
  explorerTx,
  getChainId,
  getContractAddress,
  getExplorerUrl,
  getRpcUrl,
  isContractConfigured,
} from "../config/contract";
import type { TxLifecycleStage, TxProgress } from "../types/tx-lifecycle";
import { walletManager } from "./wallet";

export type ProgressCallback = (progress: TxProgress) => void;

export type ChainEventRow = {
  id: string;
  type: "deposit" | "withdrawal" | "claim" | "referral_bonus" | "paused" | "unpaused";
  name: string;
  wallet: string;
  amount: number;
  timestamp: string;
  hash: string;
  block: number;
  status: "success" | "pending" | "failed";
  explorerUrl: string;
  networkFee: number;
};

/**
 * Sole module that talks to DemoVaultV2 via ethers.js.
 */
class ContractService {
  private readProvider: JsonRpcProvider | null = null;

  private provider() {
    const rpc = getRpcUrl();
    // Recreate if RPC target changed (e.g. after hydration to proxy URL)
    if (!this.readProvider || this.lastRpc !== rpc) {
      this.readProvider = new JsonRpcProvider(rpc, getChainId(), {
        staticNetwork: true,
      });
      this.lastRpc = rpc;
    }
    return this.readProvider;
  }

  private lastRpc: string | null = null;

  /** Reset provider if RPC URL / address changes at runtime */
  resetProvider() {
    this.readProvider = null;
    this.lastRpc = null;
  }

  isReady(): boolean {
    return isContractConfigured();
  }

  getAddress(): string {
    return getContractAddress() || "0x0000000000000000000000000000000000000000";
  }

  private readContract() {
    const address = getContractAddress();
    if (!this.isReady() || !address) {
      throw new Error(
        "NEXT_PUBLIC_CONTRACT_ADDRESS is empty. Set it on Render (traders-web) and redeploy.",
      );
    }
    return new Contract(address, DemoVaultV2Abi as InterfaceAbi, this.provider());
  }

  private async writeContract() {
    const address = getContractAddress();
    if (!this.isReady() || !address) {
      throw new Error(
        "NEXT_PUBLIC_CONTRACT_ADDRESS is empty. Set it on Render (traders-web) and redeploy.",
      );
    }
    if (!walletManager.getAddress()) {
      throw new Error("Wallet disconnected. Connect MetaMask first.");
    }
    const signer = await walletManager.getSigner();
    return new Contract(address, DemoVaultV2Abi as InterfaceAbi, signer);
  }

  private async runTx(
    label: string,
    send: () => Promise<ContractTransactionResponse>,
    onProgress?: ProgressCallback,
  ): Promise<{
    hash: string;
    status: "success" | "failed";
    explorerUrl: string;
    message: string;
  }> {
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
        message: "Broadcasting to Polygon Amoy…",
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
      const friendly =
        /user rejected|ACTION_REJECTED/i.test(message)
          ? "Transaction rejected in wallet"
          : /network|rpc|fetch/i.test(message)
            ? "RPC unavailable — check Polygon Amoy connection"
            : message;
      emit("failed", { error: friendly, message: friendly });
      throw new Error(friendly);
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

  async enroll(onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx("Enroll", () => c.enroll(), onProgress);
  }

  async withdraw(amountEth: number, onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx(
      "Withdraw",
      () => c.requestWithdraw(parseEther(String(amountEth))),
      onProgress,
    );
  }

  async cancelWithdraw(requestId: number, onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx(
      "Cancel Withdraw",
      () => c.cancelWithdraw(requestId),
      onProgress,
    );
  }

  async processWithdraw(requestId: number, onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx(
      "Process Withdraw",
      () => c.processWithdraw(requestId),
      onProgress,
    );
  }

  async settleSelf(onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx("Settle", () => c.settleSelf(), onProgress);
  }

  async claimReward(onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx("Claim", () => c.claimReward(), onProgress);
  }

  async fundTreasury(amountEth: number, onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx(
      "Fund Treasury",
      () => c.fundTreasury({ value: parseEther(String(amountEth)) }),
      onProgress,
    );
  }

  /** @deprecated V2 uses claimReward */
  async claimRewards(onProgress?: ProgressCallback) {
    return this.claimReward(onProgress);
  }

  async pause(onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx("Pause", () => c.pause(), onProgress);
  }

  async unpause(onProgress?: ProgressCallback) {
    const c = await this.writeContract();
    return this.runTx("Unpause", () => c.unpause(), onProgress);
  }

  async contractBalance(): Promise<number> {
    const c = this.readContract();
    return Number(formatEther(await c.contractBalance()));
  }

  async totalDeposited(): Promise<number> {
    const c = this.readContract();
    return Number(formatEther(await c.totalDeposited()));
  }

  async totalWithdrawn(): Promise<number> {
    const c = this.readContract();
    return Number(formatEther(await c.totalWithdrawn()));
  }

  async totalRewardsPaid(): Promise<number> {
    const c = this.readContract();
    return Number(formatEther(await c.totalRewardsPaid()));
  }

  async userCount(): Promise<number> {
    const c = this.readContract();
    return Number(await c.userCount());
  }

  /** Alias for older callers */
  async totalUsers(): Promise<number> {
    return this.userCount();
  }

  async getUserBalance(address: string): Promise<number> {
    const c = this.readContract();
    return Number(formatEther(await c.getUserBalance(address)));
  }

  async getReward(address: string): Promise<number> {
    const c = this.readContract();
    return Number(formatEther(await c.getReward(address)));
  }

  async treasuryPool(): Promise<number> {
    const c = this.readContract();
    return Number(formatEther(await c.treasuryPool()));
  }

  async principalPool(): Promise<number> {
    const c = this.readContract();
    return Number(formatEther(await c.principalPool()));
  }

  async withdrawQueueLength(): Promise<number> {
    const c = this.readContract();
    return Number(await c.withdrawQueueLength());
  }

  async isEnrolled(address: string): Promise<boolean> {
    const c = this.readContract();
    return Boolean(await c.isEnrolled(address));
  }

  async balanceOf(address: string): Promise<number> {
    return this.getUserBalance(address);
  }

  async pendingRewards(address: string): Promise<number> {
    return this.getReward(address);
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
    return CONTRACT_VERSION;
  }

  async getOnChainSnapshot(userAddress?: string | null) {
    if (!this.isReady()) return null;

    try {
      const [
        contractBal,
        deposited,
        withdrawn,
        rewardsPaid,
        users,
        owner,
        paused,
        treasury,
        principal,
      ] = await Promise.all([
        this.contractBalance(),
        this.totalDeposited(),
        this.totalWithdrawn(),
        this.totalRewardsPaid(),
        this.userCount(),
        this.owner(),
        this.paused(),
        this.treasuryPool().catch(() => 0),
        this.principalPool().catch(() => 0),
      ]);

      let investmentBalance = 0;
      let pending = 0;
      if (userAddress) {
        [investmentBalance, pending] = await Promise.all([
          this.getUserBalance(userAddress),
          this.getReward(userAddress),
        ]);
      }

      return {
        contractBalance: contractBal,
        totalDeposited: deposited,
        totalWithdrawn: withdrawn,
        totalUsers: users,
        totalRewardsPaid: rewardsPaid,
        treasuryPool: treasury,
        principalPool: principal,
        owner,
        paused,
        version: CONTRACT_VERSION,
        investmentBalance,
        pendingRewards: pending,
        network: NETWORK,
        symbol: NATIVE_SYMBOL,
        explorerBaseUrl: getExplorerUrl(),
        contractAddress: this.getAddress(),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/CALL_EXCEPTION|require\(false\)|no data present/i.test(msg)) {
        throw new Error(
          `Address ${this.getAddress()} does not respond as Vault v3 (wrong address or ABI). ` +
            "Deploy contracts/Vault.sol and set NEXT_PUBLIC_CONTRACT_ADDRESS to the Deploy receipt address.",
        );
      }
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  /**
   * Fetch recent contract events for activity feed + transaction table.
   */
  async getEvents(lookbackBlocks = 12_000): Promise<ChainEventRow[]> {
    if (!this.isReady()) return [];

    const provider = this.provider();
    const contract = this.readContract();
    let latest = 0;
    try {
      latest = await provider.getBlockNumber();
    } catch {
      throw new Error("RPC unavailable — cannot reach Polygon Amoy");
    }

    const fromBlock = Math.max(0, latest - lookbackBlocks);
    const specs: {
      name: string;
      type: ChainEventRow["type"];
      label: string;
    }[] = [
      { name: "Deposited", type: "deposit", label: "Deposit" },
      { name: "Enrolled", type: "deposit", label: "Enrolled" },
      { name: "WithdrawRequested", type: "withdrawal", label: "Withdraw Queued" },
      { name: "Withdrawn", type: "withdrawal", label: "Withdrawal Paid" },
      { name: "RewardClaimed", type: "claim", label: "Claim" },
      { name: "RewardSettled", type: "claim", label: "Daily Settlement" },
      { name: "RewardAdded", type: "referral_bonus", label: "Reward Added" },
      { name: "TreasuryFunded", type: "deposit", label: "Treasury Funded" },
      { name: "ContractFunded", type: "deposit", label: "Contract Funded" },
    ];

    const rows: ChainEventRow[] = [];

    for (const spec of specs) {
      let logs: Log[] = [];
      try {
        logs = (await contract.queryFilter(spec.name, fromBlock, latest)) as Log[];
      } catch {
        continue;
      }

      for (const log of logs) {
        const parsed = contract.interface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (!parsed) continue;

        let wallet = "0x0000000000000000000000000000000000000000";
        let amount = 0;
        let ts = Date.now();

        if (spec.name === "ContractFunded" || spec.name === "TreasuryFunded") {
          amount = Number(formatEther(parsed.args[0] as bigint));
          ts = Number(parsed.args[1]) * 1000;
        } else if (spec.name === "Enrolled") {
          wallet = String(parsed.args[0] ?? wallet);
          ts = Number(parsed.args[1]) * 1000;
        } else if (spec.name === "WithdrawRequested") {
          wallet = String(parsed.args[0] ?? wallet);
          amount = Number(formatEther(parsed.args[2] as bigint));
          ts = Number(parsed.args[3]) * 1000;
        } else if (spec.name === "RewardSettled") {
          wallet = String(parsed.args[0] ?? wallet);
          amount = Number(formatEther(parsed.args[1] as bigint));
          ts = Number(parsed.args[3]) * 1000;
        } else {
          wallet = String(parsed.args[0] ?? wallet);
          amount = Number(formatEther(parsed.args[1] as bigint));
          ts = Number(parsed.args[2]) * 1000;
        }

        const hash = log.transactionHash;
        rows.push({
          id: `${hash}-${spec.name}-${log.index}`,
          type: spec.type,
          name: spec.label,
          wallet,
          amount,
          timestamp: new Date(ts || Date.now()).toISOString(),
          hash,
          block: log.blockNumber,
          status: "success",
          explorerUrl: explorerTx(hash),
          networkFee: 0,
        });
      }
    }

    rows.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return rows;
  }

  async listInvestors(limit = 50) {
    if (!this.isReady()) return [];
    const count = await this.userCount();
    const c = this.readContract();
    const n = Math.min(count, limit);
    const out: {
      wallet: string;
      investment: number;
      rewards: number;
    }[] = [];

    for (let i = 0; i < n; i++) {
      try {
        const wallet = String(await c.users(i));
        const [investment, rewards] = await Promise.all([
          this.getUserBalance(wallet),
          this.getReward(wallet),
        ]);
        out.push({ wallet, investment, rewards });
      } catch {
        /* skip */
      }
    }
    return out;
  }

  getReadProvider() {
    return this.provider();
  }

  getAbi() {
    return DemoVaultV2Abi as InterfaceAbi;
  }
}

export const contractService = new ContractService();
