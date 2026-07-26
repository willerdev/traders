import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChainActivityType,
  ChainNetworkKind,
  ChainTxStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  Contract,
  JsonRpcProvider,
  formatEther,
  type InterfaceAbi,
} from 'ethers';
import { PrismaService } from '../prisma/prisma.service';

function loadDemoVaultAbi(): InterfaceAbi {
  const candidates = [
    join(process.cwd(), 'src', 'blockchain', 'abi', 'DemoVault.json'),
    join(process.cwd(), 'dist', 'src', 'blockchain', 'abi', 'DemoVault.json'),
    join(__dirname, 'abi', 'DemoVault.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf8')) as InterfaceAbi;
    }
  }
  // Empty ABI — sync will no-op until file is present; don't crash boot.
  return [];
}

const DemoVaultAbi = loadDemoVaultAbi();

type IngestEventDto = {
  name: string;
  type: string;
  transactionHash: string;
  blockNumber: number;
  wallet: string;
  amount?: number;
  timestamp?: string;
};

const TYPE_MAP: Record<string, ChainActivityType> = {
  deposit: ChainActivityType.DEPOSIT,
  withdrawal: ChainActivityType.WITHDRAWAL,
  claim: ChainActivityType.CLAIM,
  compound: ChainActivityType.COMPOUND,
  ownership_transfer: ChainActivityType.OWNERSHIP_TRANSFER,
  paused: ChainActivityType.PAUSED,
  unpaused: ChainActivityType.UNPAUSED,
  Deposit: ChainActivityType.DEPOSIT,
  Withdraw: ChainActivityType.WITHDRAWAL,
  Claim: ChainActivityType.CLAIM,
  Compound: ChainActivityType.COMPOUND,
  OwnershipTransferred: ChainActivityType.OWNERSHIP_TRANSFER,
  Paused: ChainActivityType.PAUSED,
  Unpaused: ChainActivityType.UNPAUSED,
};

/**
 * Indexes DemoVault events from BNB Testnet RPC into Postgres cache tables.
 * Blockchain remains source of truth; DB powers dashboards when online.
 */
@Injectable()
export class ChainSyncService {
  private readonly logger = new Logger(ChainSyncService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private rpcUrl() {
    return (
      this.config.get<string>('BNB_TESTNET_RPC') ||
      this.config.get<string>('BLOCKCHAIN_RPC_URL') ||
      'https://data-seed-prebsc-1-s1.binance.org:8545/'
    );
  }

  private contractAddress() {
    return (
      this.config.get<string>('DEMO_VAULT_ADDRESS') ||
      this.config.get<string>('CONTRACT_ADDRESS') ||
      ''
    ).trim();
  }

  private chainId() {
    return Number(this.config.get('BNB_CHAIN_ID') || 97);
  }

  async ingestEvent(dto: IngestEventDto) {
    const type =
      TYPE_MAP[dto.type] ||
      TYPE_MAP[dto.name] ||
      ChainActivityType.DEPOSIT;

    const contract = await this.ensureContractRow();

    await this.prisma.chainEvent.upsert({
      where: {
        id: this.eventIdFor(dto.transactionHash, dto.name),
      },
      create: {
        id: this.eventIdFor(dto.transactionHash, dto.name),
        contractId: contract?.id,
        name: dto.name,
        type,
        transactionHash: dto.transactionHash,
        blockNumber: dto.blockNumber || null,
        wallet: dto.wallet,
        payload: { amount: dto.amount ?? null },
        occurredAt: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      },
      update: {
        blockNumber: dto.blockNumber || null,
        wallet: dto.wallet,
      },
    });

    if (dto.transactionHash) {
      await this.prisma.chainTransaction.upsert({
        where: { hash: dto.transactionHash },
        create: {
          contractId: contract?.id,
          wallet: dto.wallet || 'unknown',
          type,
          amount: dto.amount ?? 0,
          hash: dto.transactionHash,
          blockNumber: dto.blockNumber || null,
          status: ChainTxStatus.SUCCESS,
          occurredAt: dto.timestamp ? new Date(dto.timestamp) : new Date(),
        },
        update: {
          status: ChainTxStatus.SUCCESS,
          blockNumber: dto.blockNumber || null,
        },
      });
    }

    if (type === ChainActivityType.DEPOSIT && dto.amount != null) {
      await this.prisma.chainDeposit.create({
        data: {
          contractId: contract?.id,
          wallet: dto.wallet,
          amount: dto.amount,
          hash: dto.transactionHash,
          status: ChainTxStatus.SUCCESS,
        },
      }).catch(() => undefined);
    }
    if (type === ChainActivityType.WITHDRAWAL && dto.amount != null) {
      await this.prisma.chainWithdrawal.create({
        data: {
          contractId: contract?.id,
          wallet: dto.wallet,
          amount: dto.amount,
          hash: dto.transactionHash,
          status: ChainTxStatus.SUCCESS,
        },
      }).catch(() => undefined);
    }
    if (type === ChainActivityType.CLAIM && dto.amount != null) {
      await this.prisma.chainReward.create({
        data: {
          contractId: contract?.id,
          wallet: dto.wallet,
          amount: dto.amount,
          hash: dto.transactionHash,
          claimed: true,
          status: ChainTxStatus.SUCCESS,
        },
      }).catch(() => undefined);
    }

    await this.prisma.chainNotification.create({
      data: {
        type: dto.name.toLowerCase(),
        title: `${dto.name} indexed`,
        message: `${dto.name} from ${dto.wallet?.slice(0, 10) ?? '—'}…`,
        severity: 'info',
      },
    });

    return { ok: true };
  }

  async syncFromChain(lookbackBlocks = 5000) {
    const address = this.contractAddress();
    const started = Date.now();
    const provider = new JsonRpcProvider(this.rpcUrl());

    let currentBlock = 0;
    let gasPriceGwei = 0;
    let rpcStatus: 'healthy' | 'degraded' | 'down' = 'healthy';

    try {
      currentBlock = await provider.getBlockNumber();
      const fee = await provider.getFeeData();
      gasPriceGwei = fee.gasPrice ? Number(fee.gasPrice) / 1e9 : 0;
    } catch (e) {
      rpcStatus = 'down';
      this.logger.warn(`RPC unreachable: ${String(e)}`);
    }

    await this.prisma.chainNetworkStatus.upsert({
      where: { chainId: this.chainId() },
      create: {
        chainId: this.chainId(),
        label: 'BNB Testnet',
        currentBlock,
        gasPriceGwei,
        rpcStatus,
        lastCheckedAt: new Date(),
      },
      update: {
        currentBlock,
        gasPriceGwei,
        rpcStatus,
        lastCheckedAt: new Date(),
      },
    });

    if (!address || !address.startsWith('0x') || rpcStatus === 'down') {
      return {
        ok: rpcStatus !== 'down',
        message: address
          ? 'RPC down or contract not set'
          : 'Set DEMO_VAULT_ADDRESS (or CONTRACT_ADDRESS) to sync events',
        currentBlock,
        eventsIndexed: 0,
        lastSynchronization: new Date().toISOString(),
        latencyMs: Date.now() - started,
      };
    }

    const contract = new Contract(
      address,
      DemoVaultAbi as InterfaceAbi,
      provider,
    );
    const fromBlock = Math.max(0, currentBlock - lookbackBlocks);
    let eventsIndexed = 0;

    const filters: { name: string; type: ChainActivityType }[] = [
      { name: 'Deposit', type: ChainActivityType.DEPOSIT },
      { name: 'Withdraw', type: ChainActivityType.WITHDRAWAL },
      { name: 'Claim', type: ChainActivityType.CLAIM },
      { name: 'Compound', type: ChainActivityType.COMPOUND },
      { name: 'OwnershipTransferred', type: ChainActivityType.OWNERSHIP_TRANSFER },
      { name: 'Paused', type: ChainActivityType.PAUSED },
      { name: 'Unpaused', type: ChainActivityType.UNPAUSED },
    ];

    for (const f of filters) {
      try {
        const logs = await contract.queryFilter(f.name, fromBlock, currentBlock);
        for (const log of logs) {
          const txHash = log.transactionHash;
          const args = 'args' in log ? (log as { args?: unknown[] }).args : undefined;
          let wallet = '0x0000000000000000000000000000000000000000';
          let amount: number | undefined;
          if (args && args.length) {
            if (f.name === 'OwnershipTransferred') {
              wallet = String(args[1] ?? wallet);
            } else if (f.name === 'Paused' || f.name === 'Unpaused') {
              wallet = String(args[0] ?? wallet);
            } else {
              wallet = String(args[0] ?? wallet);
              if (args[1] != null) {
                try {
                  amount = Number(formatEther(args[1] as bigint));
                } catch {
                  amount = undefined;
                }
              }
            }
          }
          await this.ingestEvent({
            name: f.name,
            type: f.type,
            transactionHash: txHash,
            blockNumber: log.blockNumber,
            wallet,
            amount,
          });
          eventsIndexed += 1;
        }
      } catch (e) {
        this.logger.warn(`queryFilter ${f.name}: ${String(e)}`);
      }
    }

    // On-chain stats snapshot
    try {
      const [bal, deposited, withdrawn, users, rewardsPaid, owner, paused, version] =
        await Promise.all([
          contract.contractBalance(),
          contract.totalDeposited(),
          contract.totalWithdrawn(),
          contract.totalUsers(),
          contract.totalRewardsPaid(),
          contract.owner(),
          contract.paused(),
          contract.VERSION(),
        ]);

      await this.prisma.chainContractStats.upsert({
        where: { contractAddress: address },
        create: {
          contractAddress: address,
          contractBalance: Number(formatEther(bal)),
          tvl: Number(formatEther(bal)),
          totalDeposited: Number(formatEther(deposited)),
          totalWithdrawn: Number(formatEther(withdrawn)),
          totalUsers: Number(users),
          totalRewardsPaid: Number(formatEther(rewardsPaid)),
          ownerAddress: String(owner),
          paused: Boolean(paused),
          version: String(version),
          lastSyncedAt: new Date(),
        },
        update: {
          contractBalance: Number(formatEther(bal)),
          tvl: Number(formatEther(bal)),
          totalDeposited: Number(formatEther(deposited)),
          totalWithdrawn: Number(formatEther(withdrawn)),
          totalUsers: Number(users),
          totalRewardsPaid: Number(formatEther(rewardsPaid)),
          ownerAddress: String(owner),
          paused: Boolean(paused),
          version: String(version),
          lastSyncedAt: new Date(),
        },
      });
    } catch (e) {
      this.logger.warn(`stats snapshot failed: ${String(e)}`);
    }

    const latest = await this.prisma.chainEvent.findFirst({
      orderBy: { occurredAt: 'desc' },
    });
    if (latest) {
      await this.prisma.chainNetworkStatus.update({
        where: { chainId: this.chainId() },
        data: {
          latestEventName: latest.name,
          latestEventAt: latest.occurredAt,
        },
      });
    }

    return {
      ok: true,
      message: `Synced ${eventsIndexed} events from block ${fromBlock} → ${currentBlock}`,
      currentBlock,
      eventsIndexed,
      lastSynchronization: new Date().toISOString(),
      latencyMs: Date.now() - started,
    };
  }

  private async ensureContractRow() {
    const address = this.contractAddress();
    if (!address) return null;

    const network = await this.prisma.chainNetwork.upsert({
      where: { kind: ChainNetworkKind.BNB },
      create: {
        kind: ChainNetworkKind.BNB,
        label: 'BNB Smart Chain Testnet',
        chainId: this.chainId(),
        rpcUrl: this.rpcUrl(),
        explorerUrl: 'https://testnet.bscscan.com',
        isTestnet: true,
      },
      update: { rpcUrl: this.rpcUrl() },
    });

    return this.prisma.chainContract.upsert({
      where: {
        networkId_address: { networkId: network.id, address },
      },
      create: {
        networkId: network.id,
        address,
        version: '1.0.0',
        symbol: 'BNB',
      },
      update: {},
    });
  }

  private eventIdFor(hash: string, name: string) {
    return createHash('sha256')
      .update(`${hash}:${name}`)
      .digest('hex')
      .slice(0, 24);
  }
}
