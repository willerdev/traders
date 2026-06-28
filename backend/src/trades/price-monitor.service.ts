import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';
import { SignalHubService } from '../signals/signal-hub.service';
import { normalizeChartSymbol } from '../ai/chart-setup.util';
import { Signal, Trade, TradeDirection } from '@prisma/client';

export type SetupOutcome = 'tp' | 'sl';

@Injectable()
export class PriceMonitorService {
  private readonly logger = new Logger(PriceMonitorService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private signalHub: SignalHubService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async monitorOpenTrades() {
    const openSignals = await this.prisma.signal.findMany({
      where: { status: 'OPEN' },
      include: { trade: true },
    });

    if (openSignals.length === 0) return;

    for (const signal of openSignals) {
      if (!signal.trade) continue;

      try {
        const price = await this.fetchPrice(signal.symbol);
        if (price === null) continue;

        const entryMin = Number(signal.entryMin);
        const entryMax = Number(signal.entryMax);
        const tp = Number(signal.takeProfit);
        const sl = Number(signal.stopLoss);
        const isBuy = signal.direction === 'BUY';

        const inEntryZone = price >= entryMin && price <= entryMax;

        if (!signal.trade.activatedAt && inEntryZone) {
          await this.prisma.trade.update({
            where: { id: signal.trade.id },
            data: {
              activatedAt: new Date(),
              entryPrice: price,
            },
          });
          continue;
        }

        if (!signal.trade.activatedAt) continue;

        const outcome = this.outcomeAtPrice(
          signal.direction,
          tp,
          sl,
          price,
        );

        if (outcome === 'tp') {
          await this.wallet.creditTpReward(signal.userId, signal.id, price);
        } else if (outcome === 'sl') {
          await this.wallet.resolveAsLoss(signal.userId, signal.id, price);
        }
      } catch (err) {
        this.logger.warn(
          `Price check failed for ${signal.symbol}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  outcomeAtPrice(
    direction: TradeDirection,
    takeProfit: number,
    stopLoss: number,
    price: number,
  ): SetupOutcome | null {
    const isBuy = direction === 'BUY';
    const hitTp = isBuy ? price >= takeProfit : price <= takeProfit;
    const hitSl = isBuy ? price <= stopLoss : price >= stopLoss;
    if (hitTp) return 'tp';
    if (hitSl) return 'sl';
    return null;
  }

  async ensureTradeActivated(
    trade: Trade,
    signal: Pick<Signal, 'entryMin' | 'entryMax'>,
    price?: number,
  ) {
    if (trade.activatedAt) return trade;

    const entryPrice =
      price ?? (Number(signal.entryMin) + Number(signal.entryMax)) / 2;

    return this.prisma.trade.update({
      where: { id: trade.id },
      data: {
        activatedAt: new Date(),
        entryPrice,
      },
    });
  }

  async fetchPrice(symbol: string): Promise<number | null> {
    const normalized = normalizeChartSymbol(symbol);

    if (this.signalHub.isConfigured) {
      try {
        const hubMid = await this.signalHub.getQuoteMid(normalized);
        if (hubMid !== null && Number.isFinite(hubMid)) {
          return hubMid;
        }
      } catch (err) {
        this.logger.warn(
          `Hub quote failed for ${symbol}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return this.fetchFallbackPrice(normalized);
  }

  private async fetchFallbackPrice(symbol: string): Promise<number | null> {
    const sym = normalizeChartSymbol(symbol).replace(/[^A-Z0-9]/g, '');

    const cryptoPairs: Record<string, string> = {
      BTCUSD: 'BTCUSDT',
      BTCUSDT: 'BTCUSDT',
      ETHUSD: 'ETHUSDT',
      ETHUSDT: 'ETHUSDT',
      XRPUSD: 'XRPUSDT',
      SOLUSD: 'SOLUSDT',
    };

    const metalProxies: Record<string, string> = {
      XAUUSD: 'PAXGUSDT',
      GOLD: 'PAXGUSDT',
    };

    const binanceSymbol = cryptoPairs[sym] ?? metalProxies[sym];
    if (binanceSymbol) {
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { price: string };
      return parseFloat(data.price);
    }

    if (sym.length >= 6) {
      const base = sym.slice(0, 3);
      const quote = sym.slice(3);
      if (quote === 'USD' || quote === 'EUR' || quote === 'GBP') {
        const res = await fetch(
          `https://open.er-api.com/v6/latest/${base}`,
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
          rates: Record<string, number>;
        };
        const rate = data.rates?.[quote];
        return rate ? rate : null;
      }
    }

    return null;
  }
}
