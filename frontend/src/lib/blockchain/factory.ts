import { HybridBlockchainService } from "./hybrid-service";
import type { IBlockchainService } from "./blockchain-service";

let singleton: IBlockchainService | null = null;

/**
 * Always use live ethers → DemoVaultV2 (Polygon Amoy).
 * Mock / API provider mode is disabled.
 */
export function createBlockchainService(): IBlockchainService {
  return new HybridBlockchainService();
}

export function getBlockchainService(): IBlockchainService {
  if (!singleton) singleton = createBlockchainService();
  return singleton;
}

export function resetBlockchainService() {
  singleton = null;
}
