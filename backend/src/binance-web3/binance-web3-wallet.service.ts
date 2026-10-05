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

const USDT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const DEFAULT_RPC = 'https://bsc-dataseed.binance.org';
const DEFAULT_USDT = '0x55d398326f99059fF775485246999027B3197955';

@Injectable()
export class BinanceWeb3WalletService {
  private readonly logger = new Logger(BinanceWeb3WalletService.name);

  constructor(private config: ConfigService) {}

  private rawKey() {
    return (
      this.config.get<string>('SOLO_BINANCE_WEB3_PRIVATE_KEY') ||
      this.config.get<string>('BINANCE_WEB3_PRIVATE_KEY') ||
      ''
    )
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }

  isConfigured() {
    return isSoloApp() && this.rawKey().length > 0;
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

  private wallet() {
    const key = this.rawKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'Binance Web3 wallet is not configured — set SOLO_BINANCE_WEB3_PRIVATE_KEY on solo-api',
      );
    }
    const hex = key.startsWith('0x') ? key : `0x${key}`;
    return new Wallet(hex, this.provider());
  }

  async getStatus() {
    if (!this.isConfigured()) {
      return {
        configured: false,
        network: 'BEP20',
        asset: 'USDT',
        address: null as string | null,
        usdtBalance: 0,
        message:
          'Set SOLO_BINANCE_WEB3_PRIVATE_KEY on solo-api. Withdrawals spend USDT already in that Binance Web3 wallet. Users cannot deposit.',
      };
    }
    try {
      const signer = this.wallet();
      const usdt = new Contract(this.usdtAddress(), USDT_ABI, signer);
      const [raw, decimals] = await Promise.all([
        usdt.balanceOf(signer.address) as Promise<bigint>,
        usdt.decimals() as Promise<number>,
      ]);
      const usdtBalance =
        Math.round(Number(formatUnits(raw, Number(decimals))) * 100) / 100;
      return {
        configured: true,
        network: 'BEP20',
        asset: 'USDT',
        address: signer.address,
        usdtBalance,
        message: `Withdrawals send BEP20 USDT from ${signer.address.slice(0, 6)}…${signer.address.slice(-4)}`,
      };
    } catch (err) {
      this.logger.warn(
        `Binance Web3 status failed: ${err instanceof Error ? err.message : err}`,
      );
      return {
        configured: true,
        network: 'BEP20',
        asset: 'USDT',
        address: null as string | null,
        usdtBalance: 0,
        message:
          err instanceof Error
            ? err.message
            : 'Could not read Binance Web3 USDT balance',
      };
    }
  }

  async assertCanSend(amountUsdt: number, destination: string) {
    if (!isAddress(destination)) {
      throw new BadRequestException(
        'Withdraw to a BEP20 (BSC) address. This wallet cannot send TRC20 or other networks.',
      );
    }
    const status = await this.getStatus();
    if (!status.configured) {
      throw new ServiceUnavailableException(status.message);
    }
    const need = Math.round(Number(amountUsdt) * 100) / 100;
    if (status.usdtBalance + 1e-9 < need) {
      throw new BadRequestException(
        `Binance Web3 wallet has $${status.usdtBalance.toFixed(2)} USDT available. Need $${need.toFixed(2)} USDT.`,
      );
    }
  }

  async sendUsdt(destination: string, amountUsdt: number) {
    await this.assertCanSend(amountUsdt, destination);
    const signer = this.wallet();
    const usdt = new Contract(this.usdtAddress(), USDT_ABI, signer);
    const decimals = Number(await usdt.decimals());
    const value = parseUnits(amountUsdt.toFixed(Math.min(8, decimals)), decimals);
    const tx = await usdt.transfer(destination, value);
    const receipt = await tx.wait(1);
    const hash = receipt?.hash || tx.hash;
    this.logger.log(
      `Binance Web3 sent $${amountUsdt.toFixed(2)} USDT to ${destination} tx=${hash}`,
    );
    return { hash, from: signer.address };
  }
}
