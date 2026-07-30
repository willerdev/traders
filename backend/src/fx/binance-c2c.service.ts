import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

const BINANCE_C2C_QUOTE_URL =
  'https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price';
const CACHE_TTL_MS = 60_000;

type CachedQuote = {
  fetchedAt: number;
  price: number;
  fiat: string;
  asset: string;
  tradeType: string;
};

export type BinanceC2cQuote = {
  asset: string;
  fiat: string;
  tradeType: 'BUY' | 'SELL';
  price: number;
  amountUsdt: number;
  amountUgx: number;
  fetchedAt: string;
  source: 'binance_c2c';
};

@Injectable()
export class BinanceC2cService {
  private readonly logger = new Logger(BinanceC2cService.name);
  private cache: CachedQuote | null = null;
  private inflight: Promise<CachedQuote> | null = null;

  async getUsdtUgxBuyPrice(): Promise<CachedQuote> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchQuote('UGX', 'USDT', 'BUY')
      .then((q) => {
        this.cache = q;
        return q;
      })
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
  }

  async quoteUsdtToUgx(amountUsdt: number): Promise<BinanceC2cQuote> {
    const usdt = Math.round(Number(amountUsdt) * 100) / 100;
    if (!Number.isFinite(usdt) || usdt <= 0) {
      throw new ServiceUnavailableException('Amount must be a positive USDT value');
    }
    const quote = await this.getUsdtUgxBuyPrice();
    const amountUgx = Math.round(usdt * quote.price * 100) / 100;
    return {
      asset: quote.asset,
      fiat: quote.fiat,
      tradeType: 'BUY',
      price: quote.price,
      amountUsdt: usdt,
      amountUgx,
      fetchedAt: new Date(quote.fetchedAt).toISOString(),
      source: 'binance_c2c',
    };
  }

  private async fetchQuote(
    fiat: string,
    asset: string,
    tradeType: 'BUY' | 'SELL',
  ): Promise<CachedQuote> {
    const url = `${BINANCE_C2C_QUOTE_URL}?fiat=${encodeURIComponent(fiat)}&asset=${encodeURIComponent(asset)}&tradeType=${tradeType}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TraderRankPro/1.0',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Binance C2C HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        success?: boolean;
        code?: string;
        data?: { price?: string | number; fiat?: string; asset?: string };
      };
      const price = Number(body?.data?.price);
      if (!body?.success || !Number.isFinite(price) || price <= 0) {
        throw new Error('Binance C2C returned an invalid price');
      }
      return {
        fetchedAt: Date.now(),
        price,
        fiat: body.data?.fiat ?? fiat,
        asset: body.data?.asset ?? asset,
        tradeType,
      };
    } catch (err) {
      this.logger.warn(
        `Binance C2C quote failed: ${err instanceof Error ? err.message : err}`,
      );
      if (this.cache) {
        this.logger.warn('Serving stale Binance C2C quote from cache');
        return this.cache;
      }
      throw new ServiceUnavailableException(
        'Could not fetch Binance P2P USDT/UGX price — try again shortly',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
