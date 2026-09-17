/** Shared shapes for mock + future on-chain reads (ethers/viem). */

export type ChainNetwork =
  | 'ethereum'
  | 'bnb'
  | 'base'
  | 'polygon';

export type NetworkMode = 'mainnet' | 'testnet';

export type TxStatus = 'pending' | 'success' | 'failed';

export type ActivityType =
  | 'deposit'
  | 'withdrawal'
  | 'claim'
  | 'compound'
  | 'referral_bonus'
  | 'ownership_transfer'
  | 'paused'
  | 'unpaused'
  | 'emergency_withdrawal'
  | 'wallet_connected'
  | 'wallet_disconnected';

export type InvestorStatus = 'active' | 'inactive' | 'banned';

export type ConnectionStatus = 'connected' | 'not_connected';

export interface ContractStatus {
  connection: ConnectionStatus;
  networkMode: NetworkMode;
  network: ChainNetwork;
  networkLabel: string;
  contractAddress: string;
  explorerBaseUrl: string;
  paused: boolean;
  owner: string;
  version: string;
}

export interface ContractStats {
  contractBalance: number;
  contractBalanceUsd: number;
  symbol: string;
  tvl: number;
  totalDeposits: number;
  totalWithdrawals: number;
  activeInvestors: number;
  totalRewardsDistributed: number;
  gas: { current: number; average: number; high: number };
  latestBlock: number;
  currentApy: number;
  totalFeesCollected: number;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  balance: number;
  investmentBalance: number;
  pendingRewards: number;
  claimableRewards: number;
  nextRewardAt: string;
  tier: string;
  referralEarnings: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalProfit: number;
  provider: 'metamask' | 'walletconnect' | 'coinbase' | 'mock' | null;
}

export interface BlockchainTransaction {
  id: string;
  wallet: string;
  type: ActivityType;
  amount: number;
  networkFee: number;
  block: number;
  hash: string;
  status: TxStatus;
  date: string;
  explorerUrl: string;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  wallet: string;
  amount: number;
  hash: string;
  timestamp: string;
  status: TxStatus;
  explorerUrl: string;
}

export interface ChartPoint {
  date: string;
  value: number;
}

export interface InvestmentStatistics {
  dailyDeposits: ChartPoint[];
  dailyWithdrawals: ChartPoint[];
  tvlGrowth: ChartPoint[];
  userGrowth: ChartPoint[];
  rewardsPaid: ChartPoint[];
  profitDistribution: ChartPoint[];
  monthlyComparison: { month: string; deposits: number; withdrawals: number }[];
  networkActivity: ChartPoint[];
}

export interface InvestorRow {
  wallet: string;
  joinedAt: string;
  investment: number;
  rewards: number;
  status: InvestorStatus;
  country: string;
  lastActivity: string;
}

export interface ContractEvent {
  id: string;
  name: string;
  type: ActivityType;
  transactionHash: string;
  blockNumber: number;
  timestamp: string;
  wallet: string;
  explorerUrl: string;
  payload?: Record<string, unknown>;
}

export interface BlockchainNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  severity: 'info' | 'success' | 'warning' | 'error';
}

export interface AdminDashboard {
  contractBalance: number;
  pendingWithdrawals: number;
  pendingDeposits: number;
  usersOnline: number;
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  totalFeesCollected: number;
  currentApy: number;
  contractVersion: string;
  currentNetwork: string;
  ownerAddress: string;
  treasuryWallet: string;
  reserveWallet: string;
  emergencyWallet: string;
}

export interface ContractHealth {
  healthScore: number;
  liquidityRatio: number;
  reserveRatio: number;
  rewardSustainability: number;
  pendingClaims: number;
  averageClaimTimeHours: number;
  averageDeposit: number;
  averageWithdrawal: number;
  rpcLatencyMs: number;
  blockDelay: number;
  lastSynchronization: string;
  blockchainStatus: 'healthy' | 'degraded' | 'down';
  databaseStatus: 'healthy' | 'degraded' | 'down';
  apiStatus: 'healthy' | 'degraded' | 'down';
  walletServiceStatus: 'healthy' | 'degraded' | 'down';
  explorerStatus: 'healthy' | 'degraded' | 'down';
}

export interface DashboardPayload {
  contract: ContractStatus;
  stats: ContractStats;
  wallet: WalletState;
  activity: ActivityItem[];
  statistics: InvestmentStatistics;
  transactions: BlockchainTransaction[];
  investors: InvestorRow[];
  events: ContractEvent[];
  notifications: BlockchainNotification[];
  admin: AdminDashboard | null;
  health: ContractHealth | null;
}

export interface TxActionResult {
  status: TxStatus;
  hash: string;
  message: string;
  explorerUrl: string;
}
