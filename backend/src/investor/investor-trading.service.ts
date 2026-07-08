import { Injectable, Logger } from '@nestjs/common';
import { InvestorTradeStatus, TradeDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../email/notification.service';
import { MetaApiService } from '../metaapi/metaapi.service';
import { CopyTradeRiskService } from '../copy-trading/copy-trade-risk.service';
import {
  buildCopyTradeIdentifiers,
  MetaApiPendingAction,
  resolvePendingOrderType,
  roundToSymbolDigits,
} from '../metaapi/metaapi-order.util';
import { computeTwoToOnePrice } from '../common/rr.util';

export type InvestorMirrorInput = {
  signalDbId: string;
  signalPublicId: string;
  symbol: string;
  direction: TradeDirection;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  openPrice: number;
  pending: boolean;
  orderKind?: string;
};

@Injectable()
export class InvestorTradingService {
  private readonly logger = new Logger(InvestorTradingService.name);

  constructor(
    private prisma: PrismaService,
    private metaApi: MetaApiService,
    private copyTradeRisk: CopyTradeRiskService,
    private notifications: NotificationService,
  ) {}

  async mirrorToInvestors(input: InvestorMirrorInput): Promise<void> {
    if (!this.metaApi.isConfigured) return;

    const investors = await this.prisma.user.findMany({
      where: {
        investorActive: true,
        metaApiAccountId: { not: null },
        investorSettings: { paused: false },
      },
      include: { investorSettings: true },
    });

    if (investors.length === 0) return;

    const sl = input.stopLoss;
    const tp = computeTwoToOnePrice(
      input.direction,
      input.entryMin,
      input.entryMax,
      sl,
    );

    for (const investor of investors) {
      const accountId = investor.metaApiAccountId!;
      const riskPercent = Number(investor.investorSettings?.riskPercent ?? 2);

      const existing = await this.prisma.investorTrade.findUnique({
        where: {
          signalId_userId: {
            signalId: input.signalDbId,
            userId: investor.id,
          },
        },
      });
      if (
        existing &&
        existing.status !== InvestorTradeStatus.FAILED &&
        existing.status !== InvestorTradeStatus.SKIPPED
      ) {
        continue;
      }

      let journal = existing;
      try {
        const account = await this.metaApi.getAccount(accountId);
        const sizing = await this.copyTradeRisk.calculateCopyPositionSize({
          account,
          symbol: input.symbol,
          direction: input.direction,
          stopLoss: sl,
          takeProfit: tp,
          entryPrice: input.openPrice,
          riskPercent,
        });

        if (!journal) {
          journal = await this.prisma.investorTrade.create({
            data: {
              signalId: input.signalDbId,
              userId: investor.id,
              investorAccountId: accountId,
              symbol: input.symbol,
              direction: input.direction,
              stopLoss: sl,
              takeProfit: tp,
              volume: sizing.volume,
              status: InvestorTradeStatus.PENDING,
            },
          });
        }

        const price = await this.metaApi.getSymbolPrice(account, input.symbol);
        const spec = await this.metaApi.getSymbolSpecification(
          account,
          input.symbol,
        );
        const digits = spec.digits ?? 5;
        const roundedTp = roundToSymbolDigits(tp, digits);
        const marketPrice =
          input.direction === 'BUY' ? price.ask : price.bid;

        const { comment, clientId } = buildCopyTradeIdentifiers({
          sourceDisplayName: 'Investor',
          sourceUserId: investor.id,
          signalId: input.signalPublicId,
          symbol: input.symbol,
        });

        let tradeResult;
        if (input.pending) {
          const orderKind = (input.orderKind ??
            resolvePendingOrderType(
              input.direction,
              input.openPrice,
              marketPrice,
            )) as MetaApiPendingAction;
          const roundedPrice = roundToSymbolDigits(input.openPrice, digits);
          const { trade } = await this.metaApi.placePendingOrder({
            account,
            symbol: input.symbol,
            orderKind,
            openPrice: roundedPrice,
            volume: sizing.volume,
            stopLoss: sl,
            takeProfit: roundedTp,
            comment,
            clientId,
            price,
            specDigits: digits,
          });
          tradeResult = trade;
        } else {
          const placed = await this.metaApi.placeOrderWithFallback({
            account,
            symbol: input.symbol,
            direction: input.direction,
            volume: sizing.volume,
            stopLoss: sl,
            takeProfit: roundedTp,
            entryMin: input.entryMin,
            entryMax: input.entryMax,
            comment,
            clientId,
            price,
            specDigits: digits,
            recalculateVolume: async (pendingOpen) => {
              const next = await this.copyTradeRisk.calculateCopyPositionSize({
                account,
                symbol: input.symbol,
                direction: input.direction,
                stopLoss: sl,
                takeProfit: tp,
                riskPercent,
                entryPrice: pendingOpen,
              });
              return next.volume;
            },
          });
          tradeResult = placed.trade;
        }

        await this.prisma.investorTrade.update({
          where: { id: journal.id },
          data: {
            status: InvestorTradeStatus.OPEN,
            volume: sizing.volume,
            entryPrice: input.openPrice,
            metaApiOrderId: tradeResult.orderId ?? null,
            metaApiPositionId:
              tradeResult.positionId ?? tradeResult.orderId ?? null,
            executedAt: new Date(),
          },
        });

        this.notifications.investorTradePlaced(investor.id, {
          symbol: input.symbol,
          direction: input.direction,
          volume: sizing.volume,
          signalId: input.signalPublicId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (journal) {
          await this.prisma.investorTrade.update({
            where: { id: journal.id },
            data: {
              status: InvestorTradeStatus.SKIPPED,
              notes: message,
            },
          });
        } else {
          await this.prisma.investorTrade.create({
            data: {
              signalId: input.signalDbId,
              userId: investor.id,
              investorAccountId: accountId,
              symbol: input.symbol,
              direction: input.direction,
              stopLoss: sl,
              takeProfit: tp,
              status: InvestorTradeStatus.SKIPPED,
              notes: message,
            },
          });
        }
        this.notifications.investorTradeSkipped(investor.id, {
          symbol: input.symbol,
          reason: message,
          signalId: input.signalPublicId,
        });
        this.logger.warn(
          `Investor mirror skip ${investor.id} ${input.signalPublicId}: ${message}`,
        );
      }
    }
  }
}
