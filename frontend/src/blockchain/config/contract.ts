/**
 * DemoVault deployment config — BNB Smart Chain Testnet first.
 * After Remix deploy, paste the address into CONTRACT_ADDRESS
 * (or set NEXT_PUBLIC_CONTRACT_ADDRESS).
 */

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() || "";

/** BNB Smart Chain Testnet */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);

export const NETWORK = "BNB Testnet";

export const RPC =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
  "https://data-seed-prebsc-1-s1.binance.org:8545/";

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() ||
  "https://testnet.bscscan.com";

export const NETWORK_LABEL = "BNB Smart Chain";

export const NATIVE_SYMBOL = "BNB";

export const CONTRACT_VERSION = "1.0.0";

/** Hex chain id for wallet_switchEthereumChain */
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

export const BSC_TESTNET_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: [RPC],
  blockExplorerUrls: [EXPLORER_URL],
} as const;

export function isContractConfigured(): boolean {
  return Boolean(CONTRACT_ADDRESS && CONTRACT_ADDRESS.startsWith("0x"));
}

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}
