/**
 * Canonical blockchain service for the dashboard.
 * UI → blockchainService → ethers.js → DemoVaultV2 on Polygon Amoy.
 */
export {
  blockchainService,
  connectWallet,
  disconnectWallet,
  getCurrentWallet,
  getWallet,
  getContractInfo,
  getContractBalance,
  deposit,
  withdraw,
  claimReward,
  claimRewards,
  compound,
  getEvents,
  getActivity,
  getTransactions,
  getContractEvents,
  getInvestors,
  contractBalance,
  totalDeposited,
  totalUsers,
  balanceOf,
  pendingRewards,
  subscribeEvents,
  isContractConfigured,
  getContractAddress,
  applyRuntimeContractConfig,
  contractService,
  walletManager,
  eventListener,
  NETWORK,
  NATIVE_SYMBOL,
} from "./blockchain";

import { blockchainService } from "./blockchain";
export default blockchainService;
