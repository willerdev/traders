"use client";

import { BrowserProvider, formatEther, type Eip1193Provider } from "ethers";
import {
  BSC_TESTNET_PARAMS,
  CHAIN_ID,
  CHAIN_ID_HEX,
  EXPLORER_URL,
  NETWORK,
  RPC,
} from "../config/contract";

export type WalletAccountChangeHandler = (address: string | null) => void;
export type WalletNetworkChangeHandler = (chainId: number) => void;

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      isMetaMask?: boolean;
      isCoinbaseWallet?: boolean;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

/**
 * Reusable MetaMask (EIP-1193) wallet manager.
 * Prepared for WalletConnect / Coinbase via the same provider surface later.
 */
class WalletManager {
  private provider: BrowserProvider | null = null;
  private address: string | null = null;
  private chainId: number | null = null;
  private accountListeners = new Set<WalletAccountChangeHandler>();
  private networkListeners = new Set<WalletNetworkChangeHandler>();
  private bound = false;

  isAvailable(): boolean {
    return typeof window !== "undefined" && Boolean(window.ethereum);
  }

  getAddress(): string | null {
    return this.address;
  }

  getChainId(): number | null {
    return this.chainId;
  }

  getProvider(): BrowserProvider | null {
    return this.provider;
  }

  async connect(): Promise<{ address: string; chainId: number; balanceEth: string }> {
    if (!this.isAvailable() || !window.ethereum) {
      throw new Error("MetaMask (or compatible wallet) is not installed.");
    }

    this.provider = new BrowserProvider(window.ethereum);
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];

    if (!accounts?.[0]) {
      throw new Error("No account returned from wallet.");
    }

    this.address = accounts[0];
    const network = await this.provider.getNetwork();
    this.chainId = Number(network.chainId);

    if (this.chainId !== CHAIN_ID) {
      await this.ensureCorrectNetwork();
    }

    this.bindEvents();
    const balanceEth = await this.getBalance(this.address);

    return { address: this.address, chainId: this.chainId!, balanceEth };
  }

  async disconnect(): Promise<void> {
    this.address = null;
    this.provider = null;
    this.chainId = null;
    this.accountListeners.forEach((fn) => fn(null));
  }

  async ensureCorrectNetwork(): Promise<void> {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [BSC_TESTNET_PARAMS],
        });
      } else {
        throw err;
      }
    }
    if (this.provider) {
      const network = await this.provider.getNetwork();
      this.chainId = Number(network.chainId);
    }
  }

  async getBalance(address?: string): Promise<string> {
    const addr = address ?? this.address;
    if (!addr) return "0";
    const provider =
      this.provider ??
      (typeof window !== "undefined" && window.ethereum
        ? new BrowserProvider(window.ethereum)
        : null);
    if (!provider) return "0";
    const bal = await provider.getBalance(addr);
    return formatEther(bal);
  }

  async getSigner() {
    if (!this.provider) {
      if (!this.isAvailable() || !window.ethereum) {
        throw new Error("Wallet not connected");
      }
      this.provider = new BrowserProvider(window.ethereum);
    }
    return this.provider.getSigner();
  }

  onAccountChange(handler: WalletAccountChangeHandler): () => void {
    this.accountListeners.add(handler);
    return () => this.accountListeners.delete(handler);
  }

  onNetworkChange(handler: WalletNetworkChangeHandler): () => void {
    this.networkListeners.add(handler);
    return () => this.networkListeners.delete(handler);
  }

  getNetworkMeta() {
    return {
      network: "bnb" as const,
      networkLabel: NETWORK,
      networkMode: "testnet" as const,
      explorerBaseUrl: EXPLORER_URL,
      rpc: RPC,
      chainId: CHAIN_ID,
    };
  }

  private bindEvents() {
    if (this.bound || !window.ethereum?.on) return;
    this.bound = true;

    window.ethereum.on("accountsChanged", (...args: unknown[]) => {
      const accounts = args[0] as string[];
      this.address = accounts?.[0] ?? null;
      if (!this.address) this.provider = null;
      this.accountListeners.forEach((fn) => fn(this.address));
    });

    window.ethereum.on("chainChanged", (...args: unknown[]) => {
      const hex = String(args[0] ?? "0x0");
      this.chainId = Number.parseInt(hex, 16);
      // MetaMask recommends reload; we notify listeners instead.
      this.networkListeners.forEach((fn) => fn(this.chainId!));
      if (window.ethereum) {
        this.provider = new BrowserProvider(window.ethereum);
      }
    });
  }
}

export const walletManager = new WalletManager();
