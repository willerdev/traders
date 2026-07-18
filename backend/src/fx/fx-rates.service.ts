import { Injectable, Logger } from '@nestjs/common';

type CachedRates = {
  fetchedAt: number;
  rates: Record<string, number>;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const COINBASE_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=USDT';

export type DisplayCurrencyInfo = {
  code: string;
  rate: number | null;
  source: 'coinbase' | 'fallback';
  preferredCurrency: string | null;
  derivedFromCountry: string | null;
};

export type ConvertedAmount = {
  usdt: number;
  localAmount: number | null;
  currency: string;
  rate: number | null;
  source: 'coinbase' | 'fallback';
  fallback: boolean;
};

@Injectable()
export class FxRatesService {
  private readonly logger = new Logger(FxRatesService.name);
  private cache: CachedRates | null = null;
  private inflight: Promise<Record<string, number> | null> | null = null;

  async getUsdtRates(): Promise<Record<string, number> | null> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.rates;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchCoinbaseRates()
      .then((rates) => {
        if (rates) {
          this.cache = { fetchedAt: Date.now(), rates };
        }
        return rates;
      })
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
  }

  async getRate(currency: string): Promise<{ rate: number; source: 'coinbase' } | null> {
    const code = currency.trim().toUpperCase();
    if (!code || code === 'USDT') {
      return { rate: 1, source: 'coinbase' };
    }
    const rates = await this.getUsdtRates();
    if (!rates) return null;
    const rate = rates[code];
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return { rate, source: 'coinbase' };
  }

  async convertUsdt(amountUsdt: number, currency: string): Promise<ConvertedAmount> {
    const code = currency.trim().toUpperCase() || 'USDT';
    const usdt = Number.isFinite(amountUsdt) ? amountUsdt : 0;

    if (code === 'USDT') {
      return {
        usdt,
        localAmount: usdt,
        currency: 'USDT',
        rate: 1,
        source: 'fallback',
        fallback: false,
      };
    }

    if (code === 'USD') {
      const quoted = await this.getRate('USD');
      if (quoted) {
        return {
          usdt,
          localAmount: Math.round(usdt * quoted.rate * 100) / 100,
          currency: 'USD',
          rate: quoted.rate,
          source: 'coinbase',
          fallback: false,
        };
      }
      return {
        usdt,
        localAmount: usdt,
        currency: 'USDT',
        rate: null,
        source: 'fallback',
        fallback: true,
      };
    }

    const quoted = await this.getRate(code);
    if (!quoted) {
      return {
        usdt,
        localAmount: null,
        currency: 'USDT',
        rate: null,
        source: 'fallback',
        fallback: true,
      };
    }

    const decimals = quoted.rate >= 100 ? 0 : 2;
    const factor = 10 ** decimals;
    const localAmount = Math.round(usdt * quoted.rate * factor) / factor;

    return {
      usdt,
      localAmount,
      currency: code,
      rate: quoted.rate,
      source: 'coinbase',
      fallback: false,
    };
  }

  async buildDisplayCurrency(opts: {
    code: string;
    preferredCurrency: string | null;
    derivedFromCountry: string | null;
  }): Promise<DisplayCurrencyInfo> {
    const code = opts.code.trim().toUpperCase() || 'USDT';
    if (code === 'USDT') {
      return {
        code: 'USDT',
        rate: 1,
        source: 'fallback',
        preferredCurrency: opts.preferredCurrency,
        derivedFromCountry: opts.derivedFromCountry,
      };
    }

    const quoted = await this.getRate(code);
    if (!quoted) {
      return {
        code: 'USDT',
        rate: null,
        source: 'fallback',
        preferredCurrency: opts.preferredCurrency,
        derivedFromCountry: opts.derivedFromCountry,
      };
    }

    return {
      code,
      rate: quoted.rate,
      source: 'coinbase',
      preferredCurrency: opts.preferredCurrency,
      derivedFromCountry: opts.derivedFromCountry,
    };
  }

  private async fetchCoinbaseRates(): Promise<Record<string, number> | null> {
    try {
      const res = await fetch(COINBASE_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logger.warn(`Coinbase FX HTTP ${res.status}`);
        return this.cache?.rates ?? null;
      }
      const json = (await res.json()) as {
        data?: { rates?: Record<string, string> };
      };
      const raw = json.data?.rates;
      if (!raw || typeof raw !== 'object') {
        this.logger.warn('Coinbase FX response missing rates');
        return this.cache?.rates ?? null;
      }
      const rates: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) rates[k.toUpperCase()] = n;
      }
      rates.USDT = 1;
      return rates;
    } catch (err) {
      this.logger.warn(
        `Coinbase FX fetch failed: ${err instanceof Error ? err.message : err}`,
      );
      return this.cache?.rates ?? null;
    }
  }
}
