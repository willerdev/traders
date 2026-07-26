"use client";

import { Contract, formatEther, type InterfaceAbi, type Log } from "ethers";
import DemoVaultAbi from "../abi/DemoVault.json";
import { CONTRACT_ADDRESS, explorerTx, isContractConfigured } from "../config/contract";
import { contractService } from "../services/contract";

export type ChainEventName =
  | "Deposit"
  | "Withdraw"
  | "Claim"
  | "Compound"
  | "OwnershipTransferred"
  | "Paused"
  | "Unpaused";

export type ParsedChainEvent = {
  name: ChainEventName;
  type:
    | "deposit"
    | "withdrawal"
    | "claim"
    | "compound"
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

const NAME_TO_TYPE: Record<ChainEventName, ParsedChainEvent["type"]> = {
  Deposit: "deposit",
  Withdraw: "withdrawal",
  Claim: "claim",
  Compound: "compound",
  OwnershipTransferred: "ownership_transfer",
  Paused: "paused",
  Unpaused: "unpaused",
};

/**
 * Live DemoVault event listener.
 * Flow: Receive Event → optional DB ingest → dashboard refresh → notification.
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
      CONTRACT_ADDRESS,
      DemoVaultAbi as InterfaceAbi,
      provider,
    );

    const names: ChainEventName[] = [
      "Deposit",
      "Withdraw",
      "Claim",
      "Compound",
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
        log?: Log;
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
      } else {
        wallet = String(args[0] ?? wallet);
        const rawAmount = args[1];
        if (rawAmount != null) {
          try {
            amount = Number(formatEther(rawAmount as bigint));
          } catch {
            amount = undefined;
          }
        }
      }

      const hash =
        eventLog?.log?.transactionHash ||
        eventLog?.transactionHash ||
        "";
      const blockNumber =
        eventLog?.log?.blockNumber || eventLog?.blockNumber || 0;

      let timestamp = new Date().toISOString();
      try {
        if (eventLog?.getBlock) {
          const block = await eventLog.getBlock();
          timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
        }
      } catch {
        /* ignore */
      }

      const parsed: ParsedChainEvent = {
        name,
        type: NAME_TO_TYPE[name],
        transactionHash: hash,
        blockNumber: Number(blockNumber),
        wallet,
        amount,
        explorerUrl: hash ? explorerTx(hash) : "",
        timestamp,
      };

      this.handlers.forEach((fn) => fn(parsed));

      // Persist via backend ingest (best-effort)
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
        return (JSON.parse(raw) as { state?: { token?: string } }).state?.token ?? null;
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
    /* offline / not signed in — ignore */
  }
}

export const eventListener = new EventListener();
