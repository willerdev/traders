/**
 * DemoVault deployment config — BNB Smart Chain Testnet first.
 *
 * NEXT_PUBLIC_* is baked in at Next.js build time. On Render, prefer setting
 * DEMO_VAULT_ADDRESS / CONTRACT_ADDRESS on the API; the dashboard loads it at
 * runtime via applyRuntimeContractConfig().
 */

const ZERO = "0x0000000000000000000000000000000000000000";

type RuntimeOverride = {
  contractAddress?: string;
  chainId?: number;
  rpc?: string;
  explorerUrl?: string;
};

let runtime: RuntimeOverride = {};

export function applyRuntimeContractConfig(partial: RuntimeOverride) {
  const next = { ...runtime };
  if (partial.contractAddress !== undefined) {
    const addr = partial.contractAddress.trim();
    // Never wipe a real address with the zero placeholder
    if (
      addr.startsWith("0x") &&
      addr.length >= 42 &&
      addr.toLowerCase() !== "0x0000000000000000000000000000000000000000"
    ) {
      next.contractAddress = addr;
    }
  }
  if (partial.chainId !== undefined && Number.isFinite(partial.chainId)) {
    next.chainId = Number(partial.chainId);
  }
  if (partial.rpc?.trim()) next.rpc = partial.rpc.trim();
  if (partial.explorerUrl?.trim()) next.explorerUrl = partial.explorerUrl.trim();
  runtime = next;
}

export function getContractAddress(): string {
  const fromRuntime = runtime.contractAddress?.trim() || "";
  if (fromRuntime.startsWith("0x") && fromRuntime.length >= 42) return fromRuntime;
  const fromEnv = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() || "";
  if (fromEnv.startsWith("0x") && fromEnv.length >= 42) return fromEnv;
  return "";
}

/** @deprecated Use getContractAddress() — kept for import compatibility */
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() || "";

export function getChainId(): number {
  return (
    runtime.chainId ||
    Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97)
  );
}

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);

export const NETWORK = "BNB Testnet";

export function getRpcUrl(): string {
  return (
    runtime.rpc ||
    process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
    "https://data-seed-prebsc-1-s1.binance.org:8545/"
  );
}

export const RPC =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
  "https://data-seed-prebsc-1-s1.binance.org:8545/";

export function getExplorerUrl(): string {
  return (
    runtime.explorerUrl ||
    process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() ||
    "https://testnet.bscscan.com"
  );
}

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() ||
  "https://testnet.bscscan.com";

export const NETWORK_LABEL = "BNB Smart Chain";

export const NATIVE_SYMBOL = "BNB";

export const CONTRACT_VERSION = "1.0.0";

export function getChainIdHex(): string {
  return `0x${getChainId().toString(16)}`;
}

/** Hex chain id for wallet_switchEthereumChain */
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

export function getBscTestnetParams() {
  return {
    chainId: getChainIdHex(),
    chainName: "BNB Smart Chain Testnet",
    nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
    rpcUrls: [getRpcUrl()],
    blockExplorerUrls: [getExplorerUrl()],
  } as const;
}

export const BSC_TESTNET_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: [RPC],
  blockExplorerUrls: [EXPLORER_URL],
} as const;

export function isContractConfigured(): boolean {
  const addr = getContractAddress();
  return Boolean(addr && addr.startsWith("0x") && addr !== ZERO);
}

export function explorerTx(hash: string): string {
  return `${getExplorerUrl()}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${getExplorerUrl()}/address/${address}`;
}
