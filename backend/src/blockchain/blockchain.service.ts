import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  getMockActivity,
  getMockAdmin,
  getMockContractStats,
  getMockContractStatus,
  getMockDashboard,
  getMockEvents,
  getMockHealth,
  getMockInvestors,
  getMockNotifications,
  getMockStatistics,
  getMockTransactions,
  getMockWallet,
  mockClaim,
  mockCompound,
  mockConnectWallet,
  mockDeposit,
  mockDisconnectWallet,
  mockWithdraw,
} from './mock-data';
import type {
  ContractEvent,
  DashboardPayload,
  TxActionResult,
  WalletState,
} from './blockchain.types';
import { ChainSyncService } from './chain-sync.service';

/**
 * Nest façade — mock wallet UX + ChainSyncService for BNB Testnet indexing.
 * Frontend HybridBlockchainService talks to DemoVault via ethers; this API
 * caches events/stats for dashboards.
 */
@Injectable()
export class BlockchainService {
  constructor(
    private chainSync: ChainSyncService,
    private prisma: PrismaService,
  ) {}

  async connectWallet(): Promise<WalletState> {
    await delay();
    return mockConnectWallet();
  }

  async disconnectWallet(): Promise<WalletState> {
    await delay();
    return mockDisconnectWallet();
  }

  async getWallet(): Promise<WalletState> {
    await delay(80);
    return getMockWallet();
  }

  async getNetwork() {
    await delay(60);
    const c = getMockContractStatus();
    return {
      network: c.network,
      networkLabel: c.networkLabel,
      networkMode: c.networkMode,
      explorerBaseUrl: c.explorerBaseUrl,
    };
  }

  async getContractInfo() {
    await delay(80);
    return this.getPublicContractConfig();
  }

  /** Runtime config for the frontend (address is not baked into Next builds). */
  getPublicContractConfig() {
    const address = (
      process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
      process.env.DEMO_VAULT_ADDRESS ||
      process.env.CONTRACT_ADDRESS ||
      ''
    ).trim();
    const chainId = Number(
      process.env.POLYGON_AMOY_CHAIN_ID ||
        process.env.BNB_CHAIN_ID ||
        process.env.NEXT_PUBLIC_CHAIN_ID ||
        80002,
    );
    const rpc =
      process.env.POLYGON_AMOY_RPC ||
      process.env.BNB_TESTNET_RPC ||
      process.env.BLOCKCHAIN_RPC_URL ||
      process.env.NEXT_PUBLIC_RPC_URL ||
      'https://polygon-amoy-bor-rpc.publicnode.com';
    const explorer =
      process.env.POLYGON_AMOY_EXPLORER ||
      process.env.BNB_EXPLORER_URL ||
      process.env.NEXT_PUBLIC_EXPLORER_URL ||
      'https://amoy.polygonscan.com';
    const configured = Boolean(address && address.startsWith('0x') && address.length >= 42);
    const base = getMockContractStatus();
    return {
      ...base,
      networkMode: 'testnet' as const,
      network: 'polygon' as const,
      networkLabel: 'Polygon Amoy',
      contractAddress: configured
        ? address
        : '0x0000000000000000000000000000000000000000',
      explorerBaseUrl: explorer,
      chainId,
      rpc,
      configured,
      version: '3.0.0',
    };
  }

  async getContractBalance() {
    await delay(80);
    const s = getMockContractStats();
    return {
      balance: s.contractBalance,
      balanceUsd: s.contractBalanceUsd,
      symbol: s.symbol,
    };
  }

  async getUserBalance() {
    await delay(80);
    const w = getMockWallet();
    return {
      walletBalance: w.balance,
      investmentBalance: w.investmentBalance,
    };
  }

  async getRewards() {
    await delay(80);
    const w = getMockWallet();
    return {
      pendingRewards: w.pendingRewards,
      claimableRewards: w.claimableRewards,
      nextRewardAt: w.nextRewardAt,
    };
  }

  async deposit(amount: number): Promise<TxActionResult> {
    await delay(200);
    return mockDeposit(amount);
  }

  async withdraw(amount: number): Promise<TxActionResult> {
    await delay(200);
    return mockWithdraw(amount);
  }

  async claim(): Promise<TxActionResult> {
    await delay(200);
    return mockClaim();
  }

  async compound(): Promise<TxActionResult> {
    await delay(200);
    return mockCompound();
  }

  async getTransactions() {
    await delay(100);
    return getMockTransactions();
  }

  async getStatistics() {
    await delay(100);
    return getMockStatistics();
  }

  async getEvents(): Promise<ContractEvent[]> {
    await delay(100);
    const rows = await this.prisma.chainEvent.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 50,
    });
    if (!rows.length) return getMockEvents();
    return rows.map((e) => ({
      id: e.id,
      name: e.name,
      type: mapDbType(e.type),
      transactionHash: e.transactionHash,
      blockNumber: e.blockNumber ?? 0,
      timestamp: e.occurredAt.toISOString(),
      wallet: e.wallet ?? '0x0000000000000000000000000000000000000000',
      explorerUrl: `https://testnet.bscscan.com/tx/${e.transactionHash}`,
    }));
  }

  async getActivity() {
    await delay(100);
    return getMockActivity();
  }

  async getInvestors() {
    await delay(100);
    return getMockInvestors();
  }

  async getNotifications() {
    await delay(80);
    return getMockNotifications();
  }

  async getAdminDashboard() {
    await delay(100);
    const base = getMockAdmin();
    const stats = await this.prisma.chainContractStats.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    const net = await this.prisma.chainNetworkStatus.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!stats && !net) return base;
    return {
      ...base,
      contractBalance: stats ? Number(stats.contractBalance) : base.contractBalance,
      ownerAddress: stats?.ownerAddress ?? base.ownerAddress,
      contractVersion: stats?.version ?? base.contractVersion,
      currentNetwork: net?.label ?? base.currentNetwork,
    };
  }

  async getHealth() {
    await delay(100);
    const health = getMockHealth();
    const net = await this.prisma.chainNetworkStatus.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!net) return health;
    return {
      ...health,
      rpcLatencyMs: 0,
      blockDelay: 0,
      lastSynchronization: net.lastCheckedAt.toISOString(),
      blockchainStatus:
        net.rpcStatus === 'healthy'
          ? ('healthy' as const)
          : net.rpcStatus === 'down'
            ? ('down' as const)
            : ('degraded' as const),
    };
  }

  async getContractStats() {
    await delay(80);
    return getMockContractStats();
  }

  async getDashboard(isAdmin: boolean): Promise<DashboardPayload> {
    await delay(120);
    const dash = getMockDashboard(isAdmin);
    const cfg = this.getPublicContractConfig();
    return {
      ...dash,
      contract: {
        ...dash.contract,
        contractAddress: cfg.contractAddress,
        explorerBaseUrl: cfg.explorerBaseUrl,
        networkLabel: cfg.networkLabel,
        networkMode: cfg.networkMode,
        network: cfg.network,
        version: cfg.version,
      },
    };
  }

  async sync() {
    return this.chainSync.syncFromChain();
  }

  async ingestEvent(body: {
    name: string;
    type: string;
    transactionHash: string;
    blockNumber: number;
    wallet: string;
    amount?: number;
    timestamp?: string;
  }) {
    return this.chainSync.ingestEvent(body);
  }

  async pauseContract() {
    await delay(150);
    return { ok: true, paused: true, message: 'Mock: contract paused.' };
  }

  async unpauseContract() {
    await delay(150);
    return { ok: true, paused: false, message: 'Mock: contract unpaused.' };
  }

  async updateRewardRate(rate: number) {
    await delay(150);
    return { ok: true, rate, message: 'Mock: reward rate updated.' };
  }

  async updateTreasuryWallet(address: string) {
    await delay(150);
    return { ok: true, address, message: 'Mock: treasury wallet updated.' };
  }

  async updateFee(feeBps: number) {
    await delay(150);
    return { ok: true, feeBps, message: 'Mock: fee updated.' };
  }

  async emergencyWithdraw() {
    await delay(200);
    return mockWithdraw(0);
  }

  async reindexTransactions() {
    const result = await this.chainSync.syncFromChain(20_000);
    return { ok: result.ok, indexed: result.eventsIndexed };
  }

  async reconnectRpc() {
    const result = await this.chainSync.syncFromChain(100);
    return { ok: result.ok, latencyMs: result.latencyMs ?? 0 };
  }

  async subscribeLaunch(email: string, userId?: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      throw new BadRequestException('A valid email is required');
    }
    const existing = await this.prisma.chainLaunchSubscription.findUnique({
      where: { email: normalized },
    });
    if (existing) {
      return {
        ok: true,
        alreadySubscribed: true,
        message: "You're already on the launch list. We'll email you when enrollment opens.",
      };
    }
    await this.prisma.chainLaunchSubscription.create({
      data: {
        email: normalized,
        userId: userId ?? null,
        source: 'blockchain_banner',
      },
    });
    return {
      ok: true,
      alreadySubscribed: false,
      message:
        "You're on the list — we'll notify you when the contract is live so you can enroll (15% / day, $2,000+).",
    };
  }
}

function delay(ms = 120) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapDbType(type: string): ContractEvent['type'] {
  const map: Record<string, ContractEvent['type']> = {
    DEPOSIT: 'deposit',
    WITHDRAWAL: 'withdrawal',
    CLAIM: 'claim',
    COMPOUND: 'compound',
    OWNERSHIP_TRANSFER: 'ownership_transfer',
    PAUSED: 'paused',
    UNPAUSED: 'unpaused',
  };
  return map[type] ?? 'deposit';
}
