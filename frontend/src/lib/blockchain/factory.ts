import { ApiBlockchainService, type IBlockchainService } from "./blockchain-service";
import { HybridBlockchainService } from "./hybrid-service";

let singleton: IBlockchainService | null = null;

/**
 * Factory
 * - `api`     → REST mocks only
 * - `hybrid`  → MetaMask + DemoVault (ethers) + API cache (default)
 * - `ethers`  → same as hybrid
 */
export function createBlockchainService(): IBlockchainService {
  const mode = process.env.NEXT_PUBLIC_BLOCKCHAIN_PROVIDER ?? "hybrid";
  if (mode === "api") {
    return new ApiBlockchainService();
  }
  return new HybridBlockchainService();
}

export function getBlockchainService(): IBlockchainService {
  if (!singleton) singleton = createBlockchainService();
  return singleton;
}
