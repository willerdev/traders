import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Mt5SyncLinkStatus, TradeDirection } from '@prisma/client';
import { TradeRiskService } from '../ai/trade-risk.service';
import { normalizeChartSymbol } from '../ai/chart-setup.util';
import {
  directionFromMetaApiType,
  hasActiveMt5Sync,
  isPlatformOriginatedClientId,
} from '../common/mt5-sync.util';
import { MetaApiPosition, MetaApiService } from '../metaapi/metaapi.service';
import { buildMetaApiTradeIdentifiers } from '../metaapi/metaapi-order.util';
import { PrismaService } from '../prisma/prisma.service';
import { SignalsService } from '../signals/signals.service';
import { PlatformNotificationsService } from '../platform-notifications/platform-notifications.service';
import { Mt5SyncBillingService } from './mt5-sync-billing.service';

@Injectable()
export class Mt5SyncService {
  private readonly logger = new Logger(Mt5SyncService.name);

  constructor(
    private prisma: PrismaService,
    private metaApi: MetaApiService,
    @Inject(forwardRef(() => SignalsService))
    private signals: SignalsService,
    private tradeRisk: TradeRiskService,
    private platformNotifications: PlatformNotificationsService,
    private billing: Mt5SyncBillingService,
  ) {}

  getStatus(userId: string) {
    return this.billing.getStatus(userId);
  }

  setEnabled(userId: string, enabled: boolean) {
    return this.billing.setEnabled(userId, enabled);
  }

  activate(userId: string) {
    return this.billing.activate(userId);
  }

  async deactivateExpired() {
    const now = new Date();
    const result = await this.prisma.user.updateMany({
      where: {
        mt5SyncActive: true,
        mt5SyncExpiresAt: { lt: now },
      },
      data: { mt5SyncActive: false },
    });
    if (result.count > 0) {
      this.logger.log(`Deactivated MT5 Live Sync for ${result.count} user(s)`);
    }
    return result.count;
  }

  async syncAllActiveUsers() {
    if (!this.metaApi.isConfigured) return { users: 0, imported: 0, closed: 0 };

    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: {
        mt5SyncActive: true,
        mt5SyncEnabled: true,
        mt5SyncExpiresAt: { gt: now },
        metaApiAccountId: { not: null },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        displayName: true,
        metaApiAccountId: true,
      },
    });

    let imported = 0;
    let closed = 0;
    let modified = 0;

    for (const user of users) {
      try {
        const result = await this.syncUser(user.id);
        imported += result.imported;
        closed += result.closed;
        modified += result.modified;
      } catch (err) {
        this.logger.warn(
          `MT5 sync failed for ${user.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { users: users.length, imported, closed, modified };
  }

  async syncUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        metaApiAccountId: true,
        mt5SyncActive: true,
        mt5SyncEnabled: true,
        mt5SyncExpiresAt: true,
      },
    });

    if (!user || !hasActiveMt5Sync(user)) {
      return { imported: 0, closed: 0, modified: 0 };
    }

    const userAccountId = user.metaApiAccountId!.trim();
    const account = await this.metaApi.ensureAccountReady(userAccountId);
    const positions = await this.metaApi.getPositions(account);

    const openLinks = await this.prisma.mt5SyncLink.findMany({
      where: {
        userId,
        userAccountId,
        status: Mt5SyncLinkStatus.OPEN,
      },
      include: {
        signal: {
          select: {
            id: true,
            signalId: true,
            stopLoss: true,
            takeProfit: true,
            trade: true,
          },
        },
      },
    });

    const openPositionIds = new Set(positions.map((p) => p.id));
    let imported = 0;
    let closed = 0;
    let modified = 0;

    for (const link of openLinks) {
      if (!openPositionIds.has(link.userPositionId)) {
        await this.handleUserPositionClosed(link);
        closed += 1;
        continue;
      }

      const pos = positions.find((p) => p.id === link.userPositionId);
      if (!pos) continue;

      const sl = pos.stopLoss ?? Number(link.signal.stopLoss);
      const tp = pos.takeProfit ?? Number(link.signal.takeProfit);
      const signalSl = Number(link.signal.stopLoss);
      const signalTp = Number(link.signal.takeProfit);

      if (
        (pos.stopLoss != null && Math.abs(sl - signalSl) > 1e-8) ||
        (pos.takeProfit != null && Math.abs(tp - signalTp) > 1e-8)
      ) {
        await this.handleUserStopsChanged(link, sl, tp);
        modified += 1;
      }

      await this.prisma.mt5SyncLink.update({
        where: { id: link.id },
        data: { lastSyncedAt: new Date() },
      });
    }

    const linkedPositionIds = new Set(
      openLinks.map((l) => l.userPositionId),
    );

    for (const pos of positions) {
      if (linkedPositionIds.has(pos.id)) continue;
      if (isPlatformOriginatedClientId(pos.clientId)) continue;

      const existingSignal = await this.prisma.signal.findFirst({
        where: {
          userId,
          status: 'OPEN',
          OR: [
            { metaApiPositionId: pos.id },
            { metaApiOrderId: pos.id },
          ],
        },
      });
      if (existingSignal) continue;

      const importedOk = await this.importUserPosition(user, userAccountId, pos);
      if (importedOk) imported += 1;
    }

    return { imported, closed, modified };
  }

  private async importUserPosition(
    user: { id: string; displayName: string },
    userAccountId: string,
    pos: MetaApiPosition,
  ): Promise<boolean> {
    const direction = directionFromMetaApiType(pos.type);
    if (!direction) return false;

    const sl = pos.stopLoss;
    const tp = pos.takeProfit;
    if (sl == null || tp == null || sl <= 0 || tp <= 0) {
      this.logger.debug(
        `Skip sync import ${pos.symbol}: missing SL/TP on user position`,
      );
      return false;
    }

    const symbol = normalizeChartSymbol(pos.symbol);
    const openPrice = pos.openPrice;
    const tolerance = Math.max(openPrice * 0.001, 0.00001);

    try {
      const created = await this.signals.createFromMt5Sync(user.id, {
        symbol,
        direction: direction as TradeDirection,
        openPrice,
        entryMin: openPrice - tolerance,
        entryMax: openPrice + tolerance,
        stopLoss: sl,
        takeProfit: tp,
        userAccountId,
        userPositionId: pos.id,
        volume: pos.volume,
      });

      if (!created?.signalDbId) return false;

      const systemAccountId = this.metaApi.getConfiguredDefaultAccountId();
      if (!systemAccountId) {
        await this.prisma.mt5SyncLink.updateMany({
          where: { signalId: created.signalDbId },
          data: {
            status: Mt5SyncLinkStatus.FAILED,
            lastError: 'Platform MT5 account not configured',
          },
        });
        return false;
      }

      const mirror = await this.mirrorOpenOnSystemAccount(
        user,
        created,
        symbol,
        direction as TradeDirection,
        openPrice,
        sl,
        tp,
        systemAccountId,
      );

      await this.prisma.mt5SyncLink.create({
        data: {
          userId: user.id,
          signalId: created.signalDbId,
          userAccountId,
          userPositionId: pos.id,
          systemAccountId,
          systemPositionId: mirror.positionId ?? mirror.orderId ?? null,
          systemOrderId: mirror.orderId ?? null,
          status: mirror.ok ? Mt5SyncLinkStatus.OPEN : Mt5SyncLinkStatus.FAILED,
          lastError: mirror.error,
        },
      });

      if (mirror.ok) {
        await this.prisma.signal.update({
          where: { id: created.signalDbId },
          data: {
            metaApiAccountId: systemAccountId,
            metaApiOrderId: mirror.orderId,
            metaApiPositionId: mirror.positionId,
            metaApiExecutedAt: new Date(),
          },
        });
      } else {
        await this.platformNotifications.create({
          userId: user.id,
          type: 'mt5_sync_mirror_failed',
          title: 'MT5 Live Sync mirror failed',
          body: `Could not mirror ${symbol} on the platform account. Your MT5 trade is unaffected.`,
        });
      }

      return mirror.ok;
    } catch (err) {
      this.logger.warn(
        `Import user position failed ${pos.symbol}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  private async mirrorOpenOnSystemAccount(
    user: { id: string; displayName: string },
    created: {
      signalDbId: string;
      signalPublicId: string;
      symbol: string;
    },
    symbol: string,
    direction: TradeDirection,
    openPrice: number,
    sl: number,
    tp: number,
    systemAccountId: string,
  ) {
    try {
      const account = await this.metaApi.getAccount(systemAccountId);
      const sizing = await this.tradeRisk.calculatePositionSize({
        account,
        symbol,
        direction,
        entryPrice: openPrice,
        stopLoss: sl,
        takeProfit: tp,
      });

      const { comment, clientId } = buildMetaApiTradeIdentifiers({
        displayName: user.displayName,
        userId: user.id,
        signalId: created.signalPublicId,
        symbol,
      });

      const placed = await this.metaApi.placeOrderWithFallback({
        account,
        symbol,
        direction,
        volume: sizing.volume,
        stopLoss: sl,
        takeProfit: tp,
        entryMin: openPrice,
        entryMax: openPrice,
        comment,
        clientId,
      });

      return {
        ok: true,
        orderId: placed.trade.orderId ?? null,
        positionId: placed.trade.positionId ?? placed.trade.orderId ?? null,
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        orderId: null,
        positionId: null,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      };
    }
  }

  private async handleUserStopsChanged(
    link: {
      id: string;
      systemAccountId: string;
      systemPositionId: string | null;
      systemOrderId: string | null;
      signal: { id: string; signalId: string; stopLoss: unknown; takeProfit: unknown };
    },
    stopLoss: number,
    takeProfit: number,
  ) {
    await this.prisma.signal.update({
      where: { id: link.signal.id },
      data: { stopLoss, takeProfit },
    });
    await this.prisma.trade.updateMany({
      where: { signalId: link.signal.id },
      data: { stopLoss, takeProfit },
    });

    if (!this.metaApi.isConfigured || !link.systemAccountId) return;

    try {
      const account = await this.metaApi.ensureAccountReady(link.systemAccountId);
      if (link.systemPositionId) {
        await this.metaApi.modifyPositionStops(account, {
          positionId: link.systemPositionId,
          stopLoss,
          takeProfit,
        });
      } else if (link.systemOrderId) {
        await this.metaApi.modifyPendingOrderStops(account, {
          orderId: link.systemOrderId,
          stopLoss,
          takeProfit,
        });
      }
    } catch (err) {
      await this.prisma.mt5SyncLink.update({
        where: { id: link.id },
        data: {
          lastError: (err instanceof Error ? err.message : String(err)).slice(
            0,
            500,
          ),
        },
      });
    }
  }

  private async handleUserPositionClosed(link: {
    id: string;
    userId: string;
    systemAccountId: string;
    systemPositionId: string | null;
    signal: { signalId: string };
  }) {
    if (this.metaApi.isConfigured && link.systemPositionId) {
      try {
        const account = await this.metaApi.ensureAccountReady(
          link.systemAccountId,
        );
        await this.metaApi.closePositionById(account, link.systemPositionId);
      } catch (err) {
        this.logger.debug(
          `System mirror close skipped for ${link.signal.signalId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    await this.signals.resolveSyncedSetupClosed(link.userId, link.signal.signalId);

    await this.prisma.mt5SyncLink.update({
      where: { id: link.id },
      data: {
        status: Mt5SyncLinkStatus.CLOSED,
        lastSyncedAt: new Date(),
      },
    });
  }

  async getAdminOverview() {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
      select: { mt5SyncFeeUsdt: true },
    });
    const now = new Date();
    const [activeCount, openLinks, recentLinks] = await Promise.all([
      this.prisma.user.count({
        where: {
          mt5SyncActive: true,
          mt5SyncExpiresAt: { gt: now },
        },
      }),
      this.prisma.mt5SyncLink.count({
        where: { status: Mt5SyncLinkStatus.OPEN },
      }),
      this.prisma.mt5SyncLink.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: { select: { displayName: true, email: true } },
          signal: { select: { signalId: true, symbol: true, status: true } },
        },
      }),
    ]);

    return {
      feeUsdt: Number(config?.mt5SyncFeeUsdt ?? 5),
      activeSubscribers: activeCount,
      openLinks,
      recentLinks: recentLinks.map((row) => ({
        id: row.id,
        userId: row.userId,
        user: row.user.displayName,
        email: row.user.email,
        signalId: row.signal.signalId,
        symbol: row.signal.symbol,
        signalStatus: row.signal.status,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        lastSyncedAt: row.lastSyncedAt.toISOString(),
        lastError: row.lastError,
      })),
    };
  }

  async updateAdminFee(feeUsdt: number) {
    if (feeUsdt <= 0 || feeUsdt > 1000) {
      throw new Error('Fee must be between 0 and 1000');
    }
    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', mt5SyncFeeUsdt: feeUsdt },
      update: { mt5SyncFeeUsdt: feeUsdt },
    });
    return { feeUsdt };
  }
}
