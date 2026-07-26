import type {
  ActivityItem,
  AdminDashboard,
  BlockchainNotification,
  BlockchainTransaction,
  ContractEvent,
  ContractHealth,
  ContractStats,
  ContractStatus,
  DashboardPayload,
  InvestmentStatistics,
  InvestorRow,
  TxActionResult,
  WalletState,
} from './blockchain.types';

const ZERO = '0x0000000000000000000000000000000000000000';
const CONTRACT = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
const EXPLORER = 'https://bscscan.com';

function explorerTx(hash: string) {
  return `${EXPLORER}/tx/${hash}`;
}

function explorerAddress(addr: string) {
  return `${EXPLORER}/address/${addr}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function series(seed: number, days = 14, scale = 10): { date: string; value: number }[] {
  return Array.from({ length: days }, (_, i) => ({
    date: daysAgo(days - 1 - i),
    value: Math.round((seed + Math.sin(i / 2) * scale + i * 1.4) * 100) / 100,
  }));
}

let walletConnected = false;
let mockWallet: WalletState = {
  connected: false,
  address: null,
  balance: 0,
  investmentBalance: 0,
  pendingRewards: 0,
  claimableRewards: 0,
  nextRewardAt: new Date(Date.now() + 3_600_000).toISOString(),
  tier: '—',
  referralEarnings: 0,
  totalDeposited: 0,
  totalWithdrawn: 0,
  totalProfit: 0,
  provider: null,
};

const connectedWallet: WalletState = {
  connected: true,
  address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  balance: 4.82,
  investmentBalance: 128.5,
  pendingRewards: 1.24,
  claimableRewards: 0.86,
  nextRewardAt: new Date(Date.now() + 2_450_000).toISOString(),
  tier: 'Gold',
  referralEarnings: 3.41,
  totalDeposited: 210.0,
  totalWithdrawn: 48.2,
  totalProfit: 33.75,
  provider: 'mock',
};

export function getMockContractStatus(): ContractStatus {
  return {
    connection: walletConnected ? 'connected' : 'not_connected',
    networkMode: 'testnet',
    network: 'bnb',
    networkLabel: 'BNB Smart Chain',
    contractAddress: CONTRACT,
    explorerBaseUrl: EXPLORER,
    paused: false,
    owner: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    version: '1.0.0-mock',
  };
}

export function getMockContractStats(): ContractStats {
  return {
    contractBalance: 12.48,
    contractBalanceUsd: 9230,
    symbol: 'BNB',
    tvl: 542.63,
    totalDeposits: 1820,
    totalWithdrawals: 1034,
    activeInvestors: 428,
    totalRewardsDistributed: 83.72,
    gas: { current: 3.2, average: 4.1, high: 7.8 },
    latestBlock: 42_891_204,
    currentApy: 18.6,
    totalFeesCollected: 12.44,
  };
}

export function getMockWallet(): WalletState {
  return { ...mockWallet };
}

export function getMockStatistics(): InvestmentStatistics {
  return {
    dailyDeposits: series(22, 14, 8),
    dailyWithdrawals: series(12, 14, 5),
    tvlGrowth: series(480, 14, 20),
    userGrowth: series(380, 14, 12).map((p) => ({
      ...p,
      value: Math.round(p.value),
    })),
    rewardsPaid: series(4, 14, 1.5),
    profitDistribution: series(2.5, 14, 0.8),
    monthlyComparison: [
      { month: 'Feb', deposits: 120, withdrawals: 70 },
      { month: 'Mar', deposits: 145, withdrawals: 88 },
      { month: 'Apr', deposits: 162, withdrawals: 91 },
      { month: 'May', deposits: 178, withdrawals: 102 },
      { month: 'Jun', deposits: 201, withdrawals: 110 },
      { month: 'Jul', deposits: 224, withdrawals: 118 },
    ],
    networkActivity: series(40, 14, 15).map((p) => ({
      ...p,
      value: Math.round(p.value),
    })),
  };
}

export function getMockTransactions(): BlockchainTransaction[] {
  const rows: BlockchainTransaction[] = [
    {
      id: 'tx1',
      wallet: '0x8f3C…A063',
      type: 'deposit',
      amount: 12.5,
      networkFee: 0.0012,
      block: 42891190,
      hash: '0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890',
      status: 'success',
      date: new Date(Date.now() - 120_000).toISOString(),
      explorerUrl: '',
    },
    {
      id: 'tx2',
      wallet: '0x71C7…976F',
      type: 'claim',
      amount: 0.42,
      networkFee: 0.0008,
      block: 42891170,
      hash: '0xbcd234efa5678901bcd234efa5678901bcd234efa5678901bcd234efa5678901',
      status: 'success',
      date: new Date(Date.now() - 900_000).toISOString(),
      explorerUrl: '',
    },
    {
      id: 'tx3',
      wallet: '0x4B20…11Aa',
      type: 'withdrawal',
      amount: 5.0,
      networkFee: 0.0015,
      block: 42891140,
      hash: '0xcde345fab6789012cde345fab6789012cde345fab6789012cde345fab6789012',
      status: 'pending',
      date: new Date(Date.now() - 1_800_000).toISOString(),
      explorerUrl: '',
    },
    {
      id: 'tx4',
      wallet: '0x9aE1…22Bb',
      type: 'compound',
      amount: 1.1,
      networkFee: 0.0011,
      block: 42891090,
      hash: '0xdef456abc7890123def456abc7890123def456abc7890123def456abc7890123',
      status: 'success',
      date: new Date(Date.now() - 3_600_000).toISOString(),
      explorerUrl: '',
    },
    {
      id: 'tx5',
      wallet: '0x22Ff…33Cc',
      type: 'referral_bonus',
      amount: 0.25,
      networkFee: 0.0005,
      block: 42891050,
      hash: '0xefa567bcd8901234efa567bcd8901234efa567bcd8901234efa567bcd8901234',
      status: 'failed',
      date: new Date(Date.now() - 7_200_000).toISOString(),
      explorerUrl: '',
    },
  ];
  return rows.map((r) => ({ ...r, explorerUrl: explorerTx(r.hash) }));
}

export function getMockActivity(): ActivityItem[] {
  return getMockTransactions().map((t) => ({
    id: t.id,
    type: t.type,
    wallet: t.wallet,
    amount: t.amount,
    hash: t.hash,
    timestamp: t.date,
    status: t.status,
    explorerUrl: t.explorerUrl,
  }));
}

export function getMockInvestors(): InvestorRow[] {
  return [
    {
      wallet: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      joinedAt: '2026-03-12T10:00:00.000Z',
      investment: 128.5,
      rewards: 12.4,
      status: 'active',
      country: 'US',
      lastActivity: new Date(Date.now() - 120_000).toISOString(),
    },
    {
      wallet: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      joinedAt: '2026-02-01T08:30:00.000Z',
      investment: 420.0,
      rewards: 55.2,
      status: 'active',
      country: 'DE',
      lastActivity: new Date(Date.now() - 900_000).toISOString(),
    },
    {
      wallet: '0x4B2099Aa11Aa22Bb33Cc44Dd55Ee66Ff77889900',
      joinedAt: '2026-01-18T14:00:00.000Z',
      investment: 85.0,
      rewards: 4.1,
      status: 'inactive',
      country: 'NG',
      lastActivity: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      wallet: '0x9aE122Bb33Cc44Dd55Ee66Ff7788990011223344',
      joinedAt: '2025-12-05T09:00:00.000Z',
      investment: 0,
      rewards: 0,
      status: 'banned',
      country: 'GB',
      lastActivity: new Date(Date.now() - 2_592_000_000).toISOString(),
    },
  ];
}

export function getMockEvents(): ContractEvent[] {
  const base: Omit<ContractEvent, 'explorerUrl'>[] = [
    {
      id: 'ev1',
      name: 'Deposit',
      type: 'deposit',
      transactionHash:
        '0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890',
      blockNumber: 42891190,
      timestamp: new Date(Date.now() - 120_000).toISOString(),
      wallet: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    },
    {
      id: 'ev2',
      name: 'RewardClaimed',
      type: 'claim',
      transactionHash:
        '0xbcd234efa5678901bcd234efa5678901bcd234efa5678901bcd234efa5678901',
      blockNumber: 42891170,
      timestamp: new Date(Date.now() - 900_000).toISOString(),
      wallet: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    },
    {
      id: 'ev3',
      name: 'Withdrawal',
      type: 'withdrawal',
      transactionHash:
        '0xcde345fab6789012cde345fab6789012cde345fab6789012cde345fab6789012',
      blockNumber: 42891140,
      timestamp: new Date(Date.now() - 1_800_000).toISOString(),
      wallet: '0x4B2099Aa11Aa22Bb33Cc44Dd55Ee66Ff77889900',
    },
    {
      id: 'ev4',
      name: 'Paused',
      type: 'paused',
      transactionHash:
        '0xffa111bbb222ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee',
      blockNumber: 42890000,
      timestamp: new Date(Date.now() - 86_400_000).toISOString(),
      wallet: ZERO,
    },
    {
      id: 'ev5',
      name: 'Unpaused',
      type: 'unpaused',
      transactionHash:
        '0x111aaa222bbb333ccc444ddd555eee666fff777aaa888bbb999ccc000ddd111',
      blockNumber: 42890100,
      timestamp: new Date(Date.now() - 80_000_000).toISOString(),
      wallet: ZERO,
    },
  ];
  return base.map((e) => ({
    ...e,
    explorerUrl: explorerTx(e.transactionHash),
  }));
}

export function getMockNotifications(): BlockchainNotification[] {
  return [
    {
      id: 'n1',
      type: 'deposit_successful',
      title: 'Deposit Successful',
      message: '12.5 BNB deposited to the investment contract.',
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      read: false,
      severity: 'success',
    },
    {
      id: 'n2',
      type: 'blockchain_connected',
      title: 'Blockchain Connected',
      message: 'RPC connected to BNB Smart Chain (testnet mock).',
      createdAt: new Date(Date.now() - 600_000).toISOString(),
      read: false,
      severity: 'info',
    },
    {
      id: 'n3',
      type: 'gas_too_high',
      title: 'Gas Too High',
      message: 'Current gas 7.8 gwei exceeds your preferred threshold.',
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      read: true,
      severity: 'warning',
    },
  ];
}

export function getMockAdmin(): AdminDashboard {
  const c = getMockContractStatus();
  const s = getMockContractStats();
  return {
    contractBalance: s.contractBalance,
    pendingWithdrawals: 8.4,
    pendingDeposits: 15.2,
    usersOnline: 37,
    dailyRevenue: 1.82,
    weeklyRevenue: 11.4,
    monthlyRevenue: 48.6,
    totalFeesCollected: s.totalFeesCollected,
    currentApy: s.currentApy,
    contractVersion: c.version,
    currentNetwork: c.networkLabel,
    ownerAddress: c.owner,
    treasuryWallet: '0x1111111111111111111111111111111111111111',
    reserveWallet: '0x2222222222222222222222222222222222222222',
    emergencyWallet: '0x3333333333333333333333333333333333333333',
  };
}

export function getMockHealth(): ContractHealth {
  return {
    healthScore: 92,
    liquidityRatio: 1.34,
    reserveRatio: 0.28,
    rewardSustainability: 0.81,
    pendingClaims: 14,
    averageClaimTimeHours: 2.4,
    averageDeposit: 18.6,
    averageWithdrawal: 9.2,
    rpcLatencyMs: 84,
    blockDelay: 1,
    lastSynchronization: new Date().toISOString(),
    blockchainStatus: 'healthy',
    databaseStatus: 'healthy',
    apiStatus: 'healthy',
    walletServiceStatus: 'healthy',
    explorerStatus: 'healthy',
  };
}

export function getMockDashboard(isAdmin: boolean): DashboardPayload {
  return {
    contract: getMockContractStatus(),
    stats: getMockContractStats(),
    wallet: getMockWallet(),
    activity: getMockActivity(),
    statistics: getMockStatistics(),
    transactions: getMockTransactions(),
    investors: getMockInvestors(),
    events: getMockEvents(),
    notifications: getMockNotifications(),
    admin: isAdmin ? getMockAdmin() : null,
    health: isAdmin ? getMockHealth() : null,
  };
}

function mockTx(type: string): TxActionResult {
  const hash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')}`;
  return {
    status: 'pending',
    hash,
    message: `${type} submitted (mock). Replace BlockchainService with ethers/viem to broadcast.`,
    explorerUrl: explorerTx(hash),
  };
}

export function mockConnectWallet(): WalletState {
  walletConnected = true;
  mockWallet = { ...connectedWallet };
  return getMockWallet();
}

export function mockDisconnectWallet(): WalletState {
  walletConnected = false;
  mockWallet = {
    connected: false,
    address: null,
    balance: 0,
    investmentBalance: 0,
    pendingRewards: 0,
    claimableRewards: 0,
    nextRewardAt: new Date(Date.now() + 3_600_000).toISOString(),
    tier: '—',
    referralEarnings: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalProfit: 0,
    provider: null,
  };
  return getMockWallet();
}

export function mockDeposit(amount: number): TxActionResult {
  if (walletConnected) {
    mockWallet.investmentBalance += amount;
    mockWallet.totalDeposited += amount;
    mockWallet.balance = Math.max(0, mockWallet.balance - amount);
  }
  return mockTx('Deposit');
}

export function mockWithdraw(amount: number): TxActionResult {
  if (walletConnected) {
    mockWallet.investmentBalance = Math.max(
      0,
      mockWallet.investmentBalance - amount,
    );
    mockWallet.totalWithdrawn += amount;
    mockWallet.balance += amount;
  }
  return mockTx('Withdrawal');
}

export function mockClaim(): TxActionResult {
  if (walletConnected) {
    const claim = mockWallet.claimableRewards;
    mockWallet.balance += claim;
    mockWallet.totalProfit += claim;
    mockWallet.claimableRewards = 0;
    mockWallet.pendingRewards = 0;
  }
  return mockTx('Claim');
}

export function mockCompound(): TxActionResult {
  if (walletConnected) {
    mockWallet.investmentBalance += mockWallet.claimableRewards;
    mockWallet.claimableRewards = 0;
    mockWallet.pendingRewards = 0;
  }
  return mockTx('Compound');
}

export { CONTRACT, EXPLORER, ZERO, explorerAddress };
