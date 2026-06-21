import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

@Injectable()
export class PriceMonitorService {
  private readonly logger = new Logger(PriceMonitorService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
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

        const hitTp = isBuy ? price >= tp : price <= tp;
        const hitSl = isBuy ? price <= sl : price >= sl;

        if (hitTp) {
          await this.wallet.creditTpReward(signal.userId, signal.id, price);
        } else if (hitSl) {
          await this.wallet.resolveAsLoss(signal.userId, signal.id, price);
        }
      } catch (err) {
        this.logger.warn(
          `Price check failed for ${signal.symbol}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  async fetchPrice(symbol: string): Promise<number | null> {
    const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const cryptoPairs: Record<string, string> = {
      BTCUSD: 'BTCUSDT',
      BTCUSDT: 'BTCUSDT',
      ETHUSD: 'ETHUSDT',
      ETHUSDT: 'ETHUSDT',
      XRPUSD: 'XRPUSDT',
      SOLUSD: 'SOLUSDT',
    };

    const binanceSymbol = cryptoPairs[sym];
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
