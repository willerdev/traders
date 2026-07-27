"use client";

import { Contract, formatEther, type InterfaceAbi } from "ethers";
import DemoVaultV2Abi from "../abi/DemoVaultV2.json";
import {
  explorerTx,
  getContractAddress,
  isContractConfigured,
} from "../config/contract";
import { contractService } from "../services/contract";

export type ChainEventName =
  | "Deposited"
  | "Withdrawn"
  | "RewardClaimed"
  | "Funded"
  | "RateChanged"
  | "Paused"
  | "Unpaused"
  | "OwnershipTransferred";

export type ParsedChainEvent = {
  name: ChainEventName | string;
  type:
    | "deposit"
    | "withdrawal"
    | "claim"
    | "referral_bonus"
    | "ownership_transfer"
    | "paused"
    | "unpaused";
  transactionHash: string;
  blockNumber: number;
  wallet: string;
  amount?: number;
  explorerUrl: string;
  timestamp: string;
};

export type ChainEventHandler = (event: ParsedChainEvent) => void;

const NAME_TO_TYPE: Record<string, ParsedChainEvent["type"]> = {
  Deposited: "deposit",
  Withdrawn: "withdrawal",
  RewardClaimed: "claim",
  Funded: "deposit",
  RateChanged: "referral_bonus",
  OwnershipTransferred: "ownership_transfer",
  Paused: "paused",
  Unpaused: "unpaused",
};

/**
 * Live vault event listener on Polygon Amoy.
 */
class EventListener {
  private handlers = new Set<ChainEventHandler>();
  private contract: Contract | null = null;
  private started = false;

  on(handler: ChainEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  start() {
    if (this.started || !isContractConfigured()) return;
    this.started = true;

    const provider = contractService.getReadProvider();
    this.contract = new Contract(
      getContractAddress(),
      DemoVaultV2Abi as InterfaceAbi,
      provider,
    );

    const names = [
      "Deposited",
      "Withdrawn",
      "RewardClaimed",
      "Funded",
      "RateChanged",
      "OwnershipTransferred",
      "Paused",
      "Unpaused",
    ] as const;

    for (const name of names) {
      void this.contract.on(name, (...args: unknown[]) => {
        void this.handleRaw(name, args);
      });
    }
  }

  stop() {
    if (this.contract) {
      void this.contract.removeAllListeners();
      this.contract = null;
    }
    this.started = false;
  }

  private async handleRaw(name: string, args: unknown[]) {
    try {
      const eventLog = args[args.length - 1] as {
        log?: { transactionHash?: string; blockNumber?: number };
        transactionHash?: string;
        blockNumber?: number;
        getBlock?: () => Promise<{ timestamp: number }>;
      };

      let wallet = "0x0000000000000000000000000000000000000000";
      let amount: number | undefined;

      if (name === "OwnershipTransferred") {
        wallet = String(args[1] ?? wallet);
      } else if (name === "Paused" || name === "Unpaused") {
        wallet = String(args[0] ?? wallet);
      } else if (name === "Funded" || name === "RateChanged") {
        try {
          amount =
            name === "Funded"
              ? Number(formatEther(args[0] as bigint))
              : Number(args[0]);
        } catch {
          amount = undefined;
        }
      } else {
        wallet = String(args[0] ?? wallet);
        try {
          amount = Number(formatEther(args[1] as bigint));
        } catch {
          amount = undefined;
        }
      }

      const transactionHash =
        eventLog?.log?.transactionHash ||
        eventLog?.transactionHash ||
        "";
      const blockNumber =
        eventLog?.log?.blockNumber || eventLog?.blockNumber || 0;

      let timestamp = new Date().toISOString();
      try {
        if (eventLog?.getBlock) {
          const block = await eventLog.getBlock();
          timestamp = new Date(block.timestamp * 1000).toISOString();
        }
      } catch {
        /* keep now */
      }

      const parsed: ParsedChainEvent = {
        name,
        type: NAME_TO_TYPE[name] || "deposit",
        transactionHash,
        blockNumber,
        wallet,
        amount,
        explorerUrl: transactionHash ? explorerTx(transactionHash) : "",
        timestamp,
      };

      for (const h of this.handlers) h(parsed);
    } catch (e) {
      console.warn("[EventListener]", name, e);
    }
  }
}

export const eventListener = new EventListener();
