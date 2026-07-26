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
  | "RewardAdded"
  | "ContractFunded"
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
  RewardAdded: "referral_bonus",
  ContractFunded: "deposit",
  OwnershipTransferred: "ownership_transfer",
  Paused: "paused",
  Unpaused: "unpaused",
};

/**
 * Live DemoVaultV2 event listener on Polygon Amoy.
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

    const names: ChainEventName[] = [
      "Deposited",
      "Withdrawn",
      "RewardClaimed",
      "RewardAdded",
      "ContractFunded",
      "OwnershipTransferred",
      "Paused",
      "Unpaused",
    ];

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

  private async handleRaw(name: ChainEventName, args: unknown[]) {
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
      } else if (name === "ContractFunded") {
        try {
          amount = Number(formatEther(args[0] as bigint));
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

      const hash =
        eventLog?.log?.transactionHash || eventLog?.transactionHash || "";
      const blockNumber =
        eventLog?.log?.blockNumber || eventLog?.blockNumber || 0;

      let timestamp = new Date().toISOString();
      try {
        if (typeof args[2] === "bigint" || typeof args[2] === "number") {
          timestamp = new Date(Number(args[2]) * 1000).toISOString();
        } else if (eventLog?.getBlock) {
          const block = await eventLog.getBlock();
          timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
        }
      } catch {
        /* ignore */
      }

      const parsed: ParsedChainEvent = {
        name,
        type: NAME_TO_TYPE[name] ?? "deposit",
        transactionHash: hash,
        blockNumber: Number(blockNumber),
        wallet,
        amount,
        explorerUrl: hash ? explorerTx(hash) : "",
        timestamp,
      };

      this.handlers.forEach((fn) => fn(parsed));
      void ingestEvent(parsed);
    } catch (e) {
      console.error("[EventListener]", e);
    }
  }
}

async function ingestEvent(event: ParsedChainEvent) {
  try {
    const token = (() => {
      try {
        const raw = localStorage.getItem("trp-auth");
        if (!raw) return null;
        return (JSON.parse(raw) as { state?: { token?: string } }).state
          ?.token ?? null;
      } catch {
        return null;
      }
    })();

    await fetch("/api/v1/blockchain/events/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(event),
    });
  } catch {
    /* ignore */
  }
}

export const eventListener = new EventListener();
