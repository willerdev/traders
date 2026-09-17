/**
 * DemoVaultV2 — Polygon Amoy Testnet
 *
 * Contract address from NEXT_PUBLIC_CONTRACT_ADDRESS (inlined at Next build;
 * set on Render traders-web and redeploy after changing).
 */

const ZERO = "0x0000000000000000000000000000000000000000";

type RuntimeOverride = {
  contractAddress?: string;
  chainId?: number;
  rpc?: string;
  explorerUrl?: string;
};

let runtime: RuntimeOverride = {};

export const POLYGON_AMOY_CHAIN_ID = 80002;

export function applyRuntimeContractConfig(partial: RuntimeOverride) {
  const next = { ...runtime };
  if (partial.contractAddress !== undefined) {
    const addr = partial.contractAddress.trim();
    if (
      addr.startsWith("0x") &&
      addr.length >= 42 &&
      addr.toLowerCase() !== ZERO.toLowerCase()
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

/** Primary export — prefers env, then runtime override via getter helpers */
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() || "";

export function getChainId(): number {
  return runtime.chainId || POLYGON_AMOY_CHAIN_ID;
}

export const CHAIN_ID = POLYGON_AMOY_CHAIN_ID;

export const NETWORK = "Polygon Amoy";

export function getRpcUrl(): string {
  // Browser: same-origin proxy (avoids CORS / dead public RPC hosts)
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/blockchain/rpc`;
  }
  return (
    runtime.rpc ||
    process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
    process.env.POLYGON_AMOY_RPC?.trim() ||
    "https://polygon-amoy-bor-rpc.publicnode.com"
  );
}

export const RPC =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
  "https://polygon-amoy-bor-rpc.publicnode.com";

export function getExplorerUrl(): string {
  return (
    runtime.explorerUrl ||
    process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() ||
    "https://amoy.polygonscan.com"
  );
}

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() ||
  "https://amoy.polygonscan.com";

export const NETWORK_LABEL = "Polygon Amoy";

export const NATIVE_SYMBOL = "POL";

export const CONTRACT_VERSION = "4.0.0";

export function getChainIdHex(): string {
  return `0x${getChainId().toString(16)}`;
}

export const CHAIN_ID_HEX = `0x${POLYGON_AMOY_CHAIN_ID.toString(16)}`;

/** Public RPC for MetaMask / wallet_addEthereumChain (not the browser proxy). */
export function getPublicRpcUrl(): string {
  return (
    runtime.rpc ||
    process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
    "https://polygon-amoy-bor-rpc.publicnode.com"
  );
}

export function getAmoyChainParams() {
  return {
    chainId: getChainIdHex(),
    chainName: "Polygon Amoy Testnet",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: [getPublicRpcUrl()],
    blockExplorerUrls: [getExplorerUrl()],
  } as const;
}

/** @deprecated use getAmoyChainParams */
export const BSC_TESTNET_PARAMS = getAmoyChainParams();
export const getBscTestnetParams = getAmoyChainParams;

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
