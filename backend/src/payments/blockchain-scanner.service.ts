import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ChainTransferMatch = {
  txHash: string;
  amount: number;
  timestamp: number;
  network: string;
};

const USDT_CONTRACTS = {
  TRC20: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  BEP20: '0x55d398326f99059fF775485246999027B3197955',
  ERC20: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
} as const;

@Injectable()
export class BlockchainScannerService {
  private readonly logger = new Logger(BlockchainScannerService.name);

  constructor(private config: ConfigService) {}

  async findUsdtDeposit(params: {
    network: string;
    payAddress: string;
    expectedAmount: number;
    since: Date;
  }): Promise<ChainTransferMatch | null> {
    const network = params.network.toUpperCase();
    const minAmount = params.expectedAmount * 0.99;
    const sinceMs = params.since.getTime() - 60_000;

    try {
      if (network === 'TRC20') {
        return this.scanTronUsdt(
          params.payAddress,
          minAmount,
          sinceMs,
        );
      }
      if (network === 'BEP20') {
        return this.scanBscUsdt(
          params.payAddress,
          minAmount,
          sinceMs,
        );
      }
      if (network === 'ERC20') {
        return this.scanEthUsdt(
          params.payAddress,
          minAmount,
          sinceMs,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Blockchain scan failed (${network} ${params.payAddress}): ${err instanceof Error ? err.message : err}`,
      );
    }

    return null;
  }

  private async scanTronUsdt(
    address: string,
    minAmount: number,
    sinceMs: number,
  ): Promise<ChainTransferMatch | null> {
    const apiKey = this.config.get<string>('TRONGRID_API_KEY')?.trim();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers['TRON-PRO-API-KEY'] = apiKey;

    const url = new URL(
      `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`,
    );
    url.searchParams.set('limit', '50');
    url.searchParams.set('contract_address', USDT_CONTRACTS.TRC20);
    url.searchParams.set('only_to', 'true');

    const res = await fetch(url, { headers });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      data?: Array<{
        transaction_id?: string;
        block_timestamp?: number;
        to?: string;
        value?: string;
        token_info?: { decimals?: number };
      }>;
    };

    for (const tx of body.data ?? []) {
      if (!tx.transaction_id || !tx.block_timestamp) continue;
      if (tx.block_timestamp < sinceMs) continue;
      if (tx.to !== address) continue;

      const decimals = tx.token_info?.decimals ?? 6;
      const amount = Number(tx.value ?? 0) / 10 ** decimals;
      if (amount < minAmount) continue;

      return {
        txHash: tx.transaction_id,
        amount,
        timestamp: tx.block_timestamp,
        network: 'TRC20',
      };
    }

    return null;
  }

  private async scanBscUsdt(
    address: string,
    minAmount: number,
    sinceMs: number,
  ): Promise<ChainTransferMatch | null> {
    const apiKey = this.config.get<string>('BSCSCAN_API_KEY')?.trim();
    if (!apiKey) return null;

    const url = new URL('https://api.bscscan.com/api');
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'tokentx');
    url.searchParams.set('contractaddress', USDT_CONTRACTS.BEP20);
    url.searchParams.set('address', address);
    url.searchParams.set('page', '1');
    url.searchParams.set('offset', '50');
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('apikey', apiKey);

    const res = await fetch(url);
    if (!res.ok) return null;

    const body = (await res.json()) as {
      status?: string;
      result?: Array<{
        hash?: string;
        to?: string;
        value?: string;
        tokenDecimal?: string;
        timeStamp?: string;
      }>;
    };

    if (body.status !== '1' || !Array.isArray(body.result)) return null;

    const expectedTo = address.toLowerCase();
    for (const tx of body.result) {
      if (!tx.hash || !tx.timeStamp) continue;
      const ts = Number(tx.timeStamp) * 1000;
      if (ts < sinceMs) continue;
      if (tx.to?.toLowerCase() !== expectedTo) continue;

      const decimals = Number(tx.tokenDecimal ?? 18);
      const amount = Number(tx.value ?? 0) / 10 ** decimals;
      if (amount < minAmount) continue;

      return {
        txHash: tx.hash,
        amount,
        timestamp: ts,
        network: 'BEP20',
      };
    }

    return null;
  }

  private async scanEthUsdt(
    address: string,
    minAmount: number,
    sinceMs: number,
  ): Promise<ChainTransferMatch | null> {
    const apiKey = this.config.get<string>('ETHERSCAN_API_KEY')?.trim();
    if (!apiKey) return null;

    const url = new URL('https://api.etherscan.io/api');
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'tokentx');
    url.searchParams.set('contractaddress', USDT_CONTRACTS.ERC20);
    url.searchParams.set('address', address);
    url.searchParams.set('page', '1');
    url.searchParams.set('offset', '50');
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('apikey', apiKey);

    const res = await fetch(url);
    if (!res.ok) return null;

    const body = (await res.json()) as {
      status?: string;
      result?: Array<{
        hash?: string;
        to?: string;
        value?: string;
        tokenDecimal?: string;
        timeStamp?: string;
      }>;
    };

    if (body.status !== '1' || !Array.isArray(body.result)) return null;

    const expectedTo = address.toLowerCase();
    for (const tx of body.result) {
      if (!tx.hash || !tx.timeStamp) continue;
      const ts = Number(tx.timeStamp) * 1000;
      if (ts < sinceMs) continue;
      if (tx.to?.toLowerCase() !== expectedTo) continue;

      const decimals = Number(tx.tokenDecimal ?? 6);
      const amount = Number(tx.value ?? 0) / 10 ** decimals;
      if (amount < minAmount) continue;

      return {
        txHash: tx.hash,
        amount,
        timestamp: ts,
        network: 'ERC20',
      };
    }

    return null;
  }
}
