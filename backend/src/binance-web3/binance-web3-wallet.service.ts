import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatUnits,
  isAddress,
  parseUnits,
} from 'ethers';
import { isSoloApp } from '../common/app-variant';
import {
  decryptCredential,
  encryptCredential,
} from '../common/credential-crypto.util';
import { resolveJwtSecret } from '../config/jwt-secret';
import { PrismaService } from '../prisma/prisma.service';

const USDT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const DEFAULT_RPC = 'https://bsc-dataseed.binance.org';
const DEFAULT_USDT = '0x55d398326f99059fF775485246999027B3197955';

const NOT_CONNECTED_MESSAGE =
  'Connect your Binance Web3 wallet in Settings. Withdrawals send BEP20 USDT from your own wallet.';

export type BinanceWeb3Status = {
  configured: boolean;
  network: 'BEP20';
  asset: 'USDT';
  address: string | null;
  usdtBalance: number;
  bnbBalance: number;
  savedAt: string | null;
  message: string;
};

@Injectable()
export class BinanceWeb3WalletService {
  private readonly logger = new Logger(BinanceWeb3WalletService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  private cryptoSecret() {
    return resolveJwtSecret(this.config.get<string>('JWT_SECRET'));
  }

  private provider() {
    const rpc =
      this.config.get<string>('SOLO_BINANCE_WEB3_RPC')?.trim() || DEFAULT_RPC;
    return new JsonRpcProvider(rpc);
  }

  private usdtAddress() {
    return (
      this.config.get<string>('SOLO_BINANCE_WEB3_USDT')?.trim() || DEFAULT_USDT
    );
  }

  private normalizeKey(raw: string) {
    const key = raw.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
    const hex = key.startsWith('0x') ? key : `0x${key}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
      throw new BadRequestException(
        'That is not a valid wallet private key. It should be 64 hex characters (optionally starting with 0x). Do not paste your seed phrase.',
      );
    }
    return hex;
  }

  private async signerFor(userId: string): Promise<Wallet | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { binanceWeb3KeyEnc: true },
    });
    if (!user?.binanceWeb3KeyEnc) return null;
    try {
      const key = decryptCredential(user.binanceWeb3KeyEnc, this.cryptoSecret());
      return new Wallet(this.normalizeKey(key), this.provider());
    } catch (err) {
      this.logger.warn(
        `Binance Web3 key unreadable for ${userId}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async balancesOf(address: string) {
    const provider = this.provider();
    const usdt = new Contract(this.usdtAddress(), USDT_ABI, provider);
    const [raw, decimals, bnbRaw] = await Promise.all([
      usdt.balanceOf(address) as Promise<bigint>,
      usdt.decimals() as Promise<number>,
      provider.getBalance(address),
    ]);
    return {
      usdtBalance:
        Math.round(Number(formatUnits(raw, Number(decimals))) * 100) / 100,
      bnbBalance: Math.round(Number(formatUnits(bnbRaw, 18)) * 1e6) / 1e6,
    };
  }

  async saveKey(userId: string, rawKey: string): Promise<BinanceWeb3Status> {
    if (!isSoloApp()) {
      throw new BadRequestException(
        'Binance Web3 wallets are only available on Soloema.',
      );
    }
    const hex = this.normalizeKey(rawKey ?? '');
    const address = new Wallet(hex).address;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        binanceWeb3KeyEnc: encryptCredential(hex, this.cryptoSecret()),
        binanceWeb3Address: address,
        binanceWeb3SavedAt: new Date(),
      },
    });
    return this.getStatus(userId);
  }

  async disconnect(userId: string): Promise<BinanceWeb3Status> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        binanceWeb3KeyEnc: null,
        binanceWeb3Address: null,
        binanceWeb3SavedAt: null,
      },
    });
    return this.getStatus(userId);
  }

  async getStatus(userId: string): Promise<BinanceWeb3Status> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        binanceWeb3KeyEnc: true,
        binanceWeb3Address: true,
        binanceWeb3SavedAt: true,
      },
    });
    const base = {
      network: 'BEP20' as const,
      asset: 'USDT' as const,
      savedAt: user?.binanceWeb3SavedAt?.toISOString() ?? null,
    };
    if (!isSoloApp() || !user?.binanceWeb3KeyEnc || !user.binanceWeb3Address) {
      return {
        ...base,
        configured: false,
        address: null,
        usdtBalance: 0,
        bnbBalance: 0,
        message: NOT_CONNECTED_MESSAGE,
      };
    }
    const address = user.binanceWeb3Address;
    try {
      const balances = await this.balancesOf(address);
      return {
        ...base,
        configured: true,
        address,
        ...balances,
        message:
          balances.bnbBalance <= 0
            ? 'Connected. Add a little BNB on BSC to this address to pay network fees.'
            : `Withdrawals send BEP20 USDT from ${address.slice(0, 6)}…${address.slice(-4)}`,
      };
    } catch (err) {
      this.logger.warn(
        `Binance Web3 status failed: ${err instanceof Error ? err.message : err}`,
      );
      return {
        ...base,
        configured: true,
        address,
        usdtBalance: 0,
        bnbBalance: 0,
        message: 'Connected, but the BSC balance could not be read right now.',
      };
    }
  }

  async assertCanSend(userId: string, amountUsdt: number, destination: string) {
    if (!isAddress(destination)) {
      throw new BadRequestException(
        'Withdraw to a BEP20 (BSC) address. This wallet cannot send TRC20 or other networks.',
      );
    }
    const status = await this.getStatus(userId);
    if (!status.configured) {
      throw new ServiceUnavailableException(status.message);
    }
    const need = Math.round(Number(amountUsdt) * 100) / 100;
    if (status.usdtBalance + 1e-9 < need) {
      throw new BadRequestException(
        `Your Binance Web3 wallet has $${status.usdtBalance.toFixed(2)} USDT. Need $${need.toFixed(2)} USDT.`,
      );
    }
    if (status.bnbBalance <= 0) {
      throw new BadRequestException(
        'Your Binance Web3 wallet has no BNB for network fees. Send a little BNB (BSC) to it first.',
      );
    }
  }

  async sendUsdt(userId: string, destination: string, amountUsdt: number) {
    await this.assertCanSend(userId, amountUsdt, destination);
    const signer = await this.signerFor(userId);
    if (!signer) {
      throw new ServiceUnavailableException(NOT_CONNECTED_MESSAGE);
    }
    const usdt = new Contract(this.usdtAddress(), USDT_ABI, signer);
    const decimals = Number(await usdt.decimals());
    const value = parseUnits(amountUsdt.toFixed(Math.min(8, decimals)), decimals);
    const tx = await usdt.transfer(destination, value);
    const receipt = await tx.wait(1);
    const hash = receipt?.hash || tx.hash;
    this.logger.log(
      `Binance Web3 sent $${amountUsdt.toFixed(2)} USDT for ${userId} to ${destination} tx=${hash}`,
    );
    return { hash, from: signer.address };
  }
}
