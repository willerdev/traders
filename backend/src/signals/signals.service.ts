import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { CreateSignalDto, ClaimSetupDto, TradeOutcomeWebhookDto, TradeLifecycleItemDto, TradeLifecycleWebhookDto, HubActionDto, UpdateSetupStopsDto } from '../common/dto';
import { createHash } from 'crypto';
import { ComplianceService } from '../compliance/compliance.service';
import { ForwardSignalResult, SignalHubService } from './signal-hub.service';
import { normalizeChartSymbol } from '../ai/chart-setup.util';
import {
  PriceMonitorService,
  SetupOutcome,
} from '../trades/price-monitor.service';
import { WalletService } from '../trades/wallet.service';
import { TpClaimsService } from '../tp-claims/tp-claims.service';
import {
  computeOneToOnePrice,
  computeEntryMid,
  classifyManualCloseOutcome,
  isOneToOneClaimValidForSetup,
  priceReachedOneToOne,
} from '../common/rr.util';
import { NotificationService } from '../email/notification.service';
import { PlatformNotificationsService } from '../platform-notifications/platform-notifications.service';
import { Signal, Trade, TradeDirection, User } from '@prisma/client';
import { MetaApiService } from '../metaapi/metaapi.service';
import {
  buildMetaApiTradeIdentifiers,
  resolvePendingOpenPrice,
  resolvePendingOrderType,
  roundToSymbolDigits,
} from '../metaapi/metaapi-order.util';
import { TradeRiskService } from '../ai/trade-risk.service';
import {
  resolveSetupExecutionPhase,
  resolveTradeProgressOutcome,
  resolveTp1ClaimBlockedReason,
  isHubLimitPending,
} from '../common/setup-execution.util';
import { RISK_PERCENT, MAX_RISK_PER_TRADE, MAX_BREAKEVEN_RETRIES } from '../common/constants';
import { CopyTradingService } from '../copy-trading/copy-trading.service';

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    private prisma: PrismaService,
    private duplicateDetection: DuplicateDetectionService,
    private compliance: ComplianceService,
    private signalHub: SignalHubService,
    private priceMonitor: PriceMonitorService,
    private wallet: WalletService,
    private tpClaims: TpClaimsService,
    private notifications: NotificationService,
    private platformNotifications: PlatformNotificationsService,
    private metaApi: MetaApiService,
    private tradeRisk: TradeRiskService,
    private copyTrading: CopyTradingService,
  ) {}

  private async mirrorToCopyPool(input: {
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      entryMin: unknown;
      entryMax: unknown;
      stopLoss: unknown;
      takeProfit: unknown;
    };
    user: { id: string; displayName: string };
    openPrice: number;
    pending: boolean;
    orderKind?: string;
  }) {
    try {
      await this.copyTrading.maybeMirrorTrade({
        signalDbId: input.signal.id,
        signalPublicId: input.signal.signalId,
        sourceUserId: input.user.id,
        sourceDisplayName: input.user.displayName,
        symbol: input.signal.symbol,
        direction: input.signal.direction,
        entryMin: Number(input.signal.entryMin),
        entryMax: Number(input.signal.entryMax),
        stopLoss: Number(input.signal.stopLoss),
        takeProfit: Number(input.signal.takeProfit),
        openPrice: input.openPrice,
        pending: input.pending,
        orderKind: input.orderKind,
      });
    } catch (err) {
      this.logger.warn(
        `Copy mirror failed for ${input.signal.signalId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  getCopyTradingDashboard() {
    return this.copyTrading.getCopyDashboard();
  }

  private validateEntryRange(dto: CreateSignalDto) {
    if (dto.entryMin >= dto.entryMax) {
      throw new BadRequestException(
        'Entry min must be less than entry max (valid range required)',
      );
    }

    const mid = (dto.entryMin + dto.entryMax) / 2;
    if (dto.direction === 'BUY') {
      if (dto.stopLoss >= dto.entryMin) {
        throw new BadRequestException(
          'For BUY signals, stop loss must be below the entry range',
        );
      }
      if (dto.takeProfit <= dto.entryMax) {
        throw new BadRequestException(
          'For BUY signals, take profit must be above the entry range',
        );
      }
    } else {
      if (dto.stopLoss <= dto.entryMax) {
        throw new BadRequestException(
          'For SELL signals, stop loss must be above the entry range',
        );
      }
      if (dto.takeProfit >= dto.entryMin) {
        throw new BadRequestException(
          'For SELL signals, take profit must be below the entry range',
        );
      }
    }

    void mid;
  }

  async submit(userId: string, dto: CreateSignalDto) {
    dto = { ...dto, symbol: normalizeChartSymbol(dto.symbol) };
    this.validateEntryRange(dto);

    await this.compliance.requireActiveTrader(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { virtualAccount: true },
    });

    if (!user?.virtualAccount) {
      throw new ForbiddenException('Virtual account not found');
    }

    const { isDuplicate, matchedSignal } =
      await this.duplicateDetection.checkDuplicate(userId, dto);

    const signalData = {
      userId,
      symbol: dto.symbol,
      direction: dto.direction,
      entryMin: dto.entryMin,
      entryMax: dto.entryMax,
      stopLoss: dto.stopLoss,
      takeProfit: dto.takeProfit,
      riskRewardRatio: dto.riskRewardRatio,
      description: dto.description,
      screenshotUrl: dto.screenshotUrl,
    };

    if (isDuplicate && matchedSignal) {
      const message = `Your entry is within ${matchedSignal.pipDistance} pips of a setup already submitted by ${matchedSignal.traderName}. Change your entry to submit an original setup.`;

      await this.prisma.violation.create({
        data: {
          userId,
          type: 'DUPLICATE_SIGNAL',
          description: `Copied setup within ${matchedSignal.pipDistance} pips of @${matchedSignal.traderName}`,
          evidence: { dto: { ...dto }, matchedSignal } as object,
        },
      });

      const rejected = await this.prisma.signal.create({
        data: { ...signalData, status: 'REJECTED_DUPLICATE' },
      });

      return {
        status: 'duplicate_signal',
        signalId: rejected.signalId,
        message,
        matchedSignal,
      };
    }

    const screenshotHash = createHash('sha256')
      .update(dto.screenshotUrl)
      .digest('hex');

    const existingHash = await this.prisma.signal.findFirst({
      where: { screenshotHash, userId: { not: userId } },
    });

    if (existingHash) {
      await this.prisma.riskFlag.create({
        data: {
          userId,
          reason: 'Screenshot reuse detected',
          severity: 3,
          metadata: { existingSignalId: existingHash.signalId },
        },
      });
    }

    const signal = await this.prisma.signal.create({
      data: {
        ...signalData,
        screenshotHash,
        status: 'OPEN',
      },
    });

    await this.prisma.trade.create({
      data: {
        signalId: signal.id,
        userId,
        symbol: dto.symbol,
        direction: dto.direction,
        entryMin: dto.entryMin,
        entryMax: dto.entryMax,
        stopLoss: dto.stopLoss,
        takeProfit: dto.takeProfit,
      },
    });

    const trade = await this.prisma.trade.findUnique({
      where: { signalId: signal.id },
    });

    const forwardResult = await this.queueSetupLimitExecution({
      signal: { ...signal, trade },
      user,
      userId,
      dto,
    });

    if (forwardResult.forwarded) {
      await this.maybeNotifyHubOrderPlaced(signal, userId, forwardResult);
    }

    return this.buildForwardResponse(
      signal.signalId,
      signal.submittedAt,
      dto,
      user.displayName,
      userId,
      forwardResult,
      'accepted',
    );
  }

  async resendToHub(userId: string, signalId: string) {
    await this.compliance.requireActiveTrader(userId);

    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId },
      include: { trade: true },
    });
    if (!signal) throw new NotFoundException('Signal not found');
    if (signal.status === 'REJECTED_DUPLICATE') {
      throw new BadRequestException('Cannot resend a rejected duplicate signal');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { virtualAccount: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const dto: CreateSignalDto = {
      symbol: signal.symbol,
      direction: signal.direction,
      entryMin: Number(signal.entryMin),
      entryMax: Number(signal.entryMax),
      stopLoss: Number(signal.stopLoss),
      takeProfit: Number(signal.takeProfit),
      riskRewardRatio: Number(signal.riskRewardRatio),
      description: signal.description,
      screenshotUrl: signal.screenshotUrl,
    };

    const forwardResult = await this.queueSetupLimitExecution({
      signal,
      user,
      userId,
      dto,
    });

    if (forwardResult.forwarded) {
      await this.maybeNotifyHubOrderPlaced(signal, userId, forwardResult);
    }

    return this.buildForwardResponse(
      signal.signalId,
      signal.submittedAt,
      dto,
      user.displayName,
      userId,
      forwardResult,
      forwardResult.forwarded ? 'resent' : 'resend_failed',
    );
  }

  async listMetaApiAccountsForUser() {
    return this.metaApi.listAccounts({ limit: 100, deploymentStatus: 'deployed' });
  }

  async placeTrade(userId: string, signalId: string) {
    await this.compliance.requireActiveTrader(userId);

    if (!this.metaApi.isConfigured) {
      throw new ServiceUnavailableException(
        'Live trading is not configured on the server',
      );
    }

    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId },
      include: { trade: true },
    });
    if (!signal) throw new NotFoundException('Signal not found');
    if (signal.status !== 'OPEN') {
      throw new BadRequestException(
        `Only open setups can be traded (current status: ${signal.status})`,
      );
    }
    if (signal.metaApiExecutedAt) {
      throw new BadRequestException('This setup already has a live trade placed');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { virtualAccount: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const accountId = this.metaApi.resolveAccountId(user.metaApiAccountId);
    if (!accountId) {
      throw new BadRequestException(
        'No trading account linked — choose one in Settings → Live trading account',
      );
    }

    const account = await this.metaApi.getAccount(accountId);
    const sl = Number(signal.stopLoss);
    const tp = Number(signal.takeProfit);
    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);

    const price = await this.metaApi.getSymbolPrice(account, signal.symbol);
    const marketEntry =
      signal.direction === 'BUY' ? price.ask : price.bid;

    const riskPercent = Number(
      user.virtualAccount?.riskPercent ?? RISK_PERCENT,
    );
    const maxRiskAmount = Number(
      user.virtualAccount?.maxRiskPerTrade ?? MAX_RISK_PER_TRADE,
    );

    const spec = await this.metaApi.getSymbolSpecification(
      account,
      signal.symbol,
    );

    const { comment: orderComment, clientId } = buildMetaApiTradeIdentifiers({
      displayName: user.displayName,
      userId,
      signalId: signal.signalId,
      symbol: signal.symbol,
    });

    const riskInput = {
      account,
      symbol: signal.symbol,
      direction: signal.direction,
      stopLoss: sl,
      takeProfit: tp,
      riskPercent: Math.max(riskPercent, RISK_PERCENT),
      maxRiskAmount,
    };

    let sizing = await this.tradeRisk.calculatePositionSize({
      ...riskInput,
      entryPrice: marketEntry,
    });

    const placed = await this.metaApi.placeOrderWithFallback({
      account,
      symbol: signal.symbol,
      direction: signal.direction,
      volume: sizing.volume,
      stopLoss: sl,
      takeProfit: tp,
      entryMin,
      entryMax,
      price,
      specDigits: spec.digits,
      comment: orderComment,
      clientId,
      recalculateVolume: async (openPrice) => {
        sizing = await this.tradeRisk.calculatePositionSize({
          ...riskInput,
          entryPrice: openPrice,
        });
        return sizing.volume;
      },
    });

    const entryPrice = placed.openPrice;
    const result = placed.trade;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signal.id },
        data: {
          metaApiAccountId: account.id,
          metaApiOrderId: result.orderId ?? null,
          metaApiPositionId: result.positionId ?? result.orderId ?? null,
          metaApiExecutedAt: now,
        },
      }),
      this.prisma.trade.update({
        where: { signalId: signal.id },
        data: placed.pending
          ? { entryPrice }
          : {
              entryPrice,
              activatedAt: now,
            },
      }),
    ]);

    await this.mirrorToCopyPool({
      signal,
      user,
      openPrice: entryPrice,
      pending: placed.pending,
      orderKind: placed.orderKind,
    });

    return {
      status: placed.pending ? 'pending' : 'placed',
      signalId: signal.signalId,
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrice,
      stopLoss: sl,
      takeProfit: tp,
      quote: price,
      orderKind: placed.orderKind,
      pending: placed.pending,
      risk: {
        volume: sizing.volume,
        riskPercent: sizing.riskPercent,
        riskAmount: sizing.riskAmount,
        estimatedLossAtSl: sizing.estimatedLossAtSl,
        accountEquity: sizing.accountEquity,
        currency: sizing.currency,
        aiManaged: sizing.aiManaged,
        notes: sizing.aiNotes,
      },
      metaApi: {
        accountId: account.id,
        accountName: account.name,
        orderId: result.orderId,
        positionId: result.positionId,
        message: result.message,
        comment: orderComment,
        orderKind: placed.orderKind,
      },
    };
  }

  private async persistHubForward(
    signalDbId: string,
    displayName: string,
    userId: string,
    forwardResult: ForwardSignalResult,
  ) {
    if (!forwardResult.forwarded || !forwardResult.hub?.id) return;

    await this.prisma.signal.update({
      where: { id: signalDbId },
      data: {
        hubSenderName: this.signalHub.toSenderName(displayName, userId),
        hubRecordId: forwardResult.hub.id,
      },
    });
  }

  private signalToCreateDto(signal: {
    symbol: string;
    direction: TradeDirection;
    entryMin: unknown;
    entryMax: unknown;
    stopLoss: unknown;
    takeProfit: unknown;
    riskRewardRatio: unknown;
    description: string;
    screenshotUrl: string;
  }): CreateSignalDto {
    return {
      symbol: signal.symbol,
      direction: signal.direction,
      entryMin: Number(signal.entryMin),
      entryMax: Number(signal.entryMax),
      stopLoss: Number(signal.stopLoss),
      takeProfit: Number(signal.takeProfit),
      riskRewardRatio: Number(signal.riskRewardRatio),
      description: signal.description,
      screenshotUrl: signal.screenshotUrl,
    };
  }

  private orderDetailsFromForward(forwardResult: ForwardSignalResult): {
    orderType: string;
    entry: number;
  } | null {
    const sent = forwardResult.validation.sentPrices;
    if (!sent?.entry) return null;
    const orderType =
      (forwardResult.hub?.payload?.order_type as string | undefined) || 'limit';
    return { orderType, entry: sent.entry };
  }

  private orderDetailsFromHubPayload(
    payload: Record<string, unknown> | undefined,
    fallback: { entryMin: number; entryMax: number; direction: TradeDirection },
  ): { orderType: string; entry: number } {
    const entry = Number(payload?.entry);
    const orderType = String(payload?.order_type || 'limit');
    if (Number.isFinite(entry)) {
      return { orderType, entry };
    }
    const edge =
      fallback.direction === 'BUY' ? fallback.entryMin : fallback.entryMax;
    return { orderType, entry: edge };
  }

  private async maybeNotifyHubOrderPlaced(
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      entryMin: unknown;
      entryMax: unknown;
      stopLoss: unknown;
      takeProfit: unknown;
      hubOrderNotifiedAt: Date | null;
    },
    userId: string,
    forwardResult: ForwardSignalResult,
  ) {
    const order = this.orderDetailsFromForward(forwardResult);
    if (!order) return;
    await this.notifyHubOrderPlaced(signal, userId, order);
  }

  private async notifyHubOrderPlaced(
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      entryMin: unknown;
      entryMax: unknown;
      stopLoss: unknown;
      takeProfit: unknown;
      hubOrderNotifiedAt: Date | null;
    },
    userId: string,
    order: { orderType: string; entry: number },
  ) {
    if (signal.hubOrderNotifiedAt) return;

    await this.prisma.signal.update({
      where: { id: signal.id },
      data: { hubOrderNotifiedAt: new Date() },
    });

    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);
    const sl = Number(signal.stopLoss);
    const tp = Number(signal.takeProfit);
    const orderLabel =
      order.orderType.toLowerCase() === 'stop' ? 'Stop' : 'Limit';
    const title = `${orderLabel} order placed — ${signal.symbol}`;
    const body = `${signal.direction} ${signal.symbol}: ${order.orderType} @ ${order.entry}, entry zone ${entryMin}–${entryMax}, SL ${sl}, TP ${tp}.`;

    await this.platformNotifications.create({
      userId,
      type: 'HUB_ORDER_PLACED',
      title,
      body,
      linkUrl: '/dashboard',
      signalId: signal.signalId,
    });

    this.notifications.hubOrderPlaced(userId, {
      symbol: signal.symbol,
      signalId: signal.signalId,
      direction: signal.direction,
      orderType: order.orderType,
      entry: order.entry,
      entryMin,
      entryMax,
      stopLoss: sl,
      takeProfit: tp,
    });
  }

  private async evaluateActiveSetupHubOrder(input: {
    signal: {
      id: string;
      signalId: string;
      status: string;
      hubRecordId: string | null;
      hubSenderName: string | null;
      symbol: string;
      direction: TradeDirection;
      entryMin: unknown;
      entryMax: unknown;
      stopLoss: unknown;
      metaApiAccountId: string | null;
      metaApiOrderId: string | null;
      metaApiPositionId: string | null;
      metaApiExecutedAt: Date | null;
      trade: {
        activatedAt: Date | null;
        closedAt: Date | null;
        entryPrice: unknown;
      } | null;
    };
    userId: string;
    user: { displayName: string; metaApiAccountId: string | null };
  }): Promise<
    | { action: 'skip'; reason: string }
    | { action: 'has_order'; order: { orderType: string; entry: number } }
    | { action: 'place' }
  > {
    const { signal, userId, user } = input;

    if (signal.status !== 'OPEN') {
      return { action: 'skip', reason: 'signal_not_open' };
    }
    if (signal.trade?.closedAt) {
      return { action: 'skip', reason: 'trade_closed' };
    }

    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);
    const sl = Number(signal.stopLoss);
    const oneToOnePrice = computeOneToOnePrice(
      signal.direction,
      entryMin,
      entryMax,
      sl,
    );

    const liveTrade = await this.resolveSetupLiveTrade(
      signal,
      userId,
      user,
      oneToOnePrice,
      null,
    );
    const liveStatus =
      typeof liveTrade?.status === 'string' ? liveTrade.status : undefined;

    if (liveStatus === 'open') {
      return { action: 'skip', reason: 'position_open' };
    }
    if (liveStatus === 'pending') {
      const order = this.orderDetailsFromHubPayload(undefined, {
        entryMin,
        entryMax,
        direction: signal.direction,
      });
      return { action: 'has_order', order };
    }

    if (!this.signalHub.isConfigured) {
      return { action: 'skip', reason: 'hub_not_configured' };
    }

    const sendername =
      signal.hubSenderName ||
      this.signalHub.toSenderName(user.displayName, userId);
    const hub = await this.signalHub.getByExternalId(signal.signalId, sendername);
    const hubStatus = hub?.status ?? null;
    const hubExecuted = Boolean(hub?.progress?.executed);

    if (hubExecuted) {
      return { action: 'skip', reason: 'hub_executed' };
    }

    if (signal.hubRecordId && !hub) {
      return { action: 'place' };
    }

    if (
      isHubLimitPending(signal.hubRecordId, hubExecuted, hubStatus) ||
      (hub?.id && !hubExecuted && hubStatus)
    ) {
      const status = (hubStatus ?? '').toLowerCase();
      const terminal = [
        'invalidated',
        'failed',
        'cancelled',
        'canceled',
        'closed',
        'rejected',
        'expired',
        'done',
        'not_found',
      ];
      if (!status || !terminal.some((t) => status.includes(t))) {
        const order = this.orderDetailsFromHubPayload(
          hub?.payload as Record<string, unknown> | undefined,
          { entryMin, entryMax, direction: signal.direction },
        );
        return { action: 'has_order', order };
      }
    }

    if (!signal.hubRecordId) {
      return { action: 'place' };
    }

    const status = (hubStatus ?? '').toLowerCase();
    if (
      status &&
      ['invalidated', 'failed', 'cancelled', 'canceled', 'rejected', 'expired'].some(
        (t) => status.includes(t),
      )
    ) {
      return { action: 'place' };
    }

    return { action: 'skip', reason: 'unknown_hub_state' };
  }

  private isActiveTraderUser(user: {
    status: string;
    registrationPaid: boolean;
  }): boolean {
    return user.status === 'ACTIVE' && user.registrationPaid;
  }

  private resolveMetaApiLimitOrderDetails(
    signal: {
      direction: TradeDirection;
      entryMin: unknown;
      entryMax: unknown;
    },
    marketPrice?: number | null,
  ): { orderType: string; entry: number } {
    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);
    const edge = signal.direction === 'BUY' ? entryMin : entryMax;
    if (marketPrice == null || !Number.isFinite(marketPrice)) {
      return { orderType: 'limit', entry: edge };
    }
    const openPrice = resolvePendingOpenPrice(
      signal.direction,
      entryMin,
      entryMax,
      marketPrice,
    );
    const orderKind = resolvePendingOrderType(
      signal.direction,
      openPrice,
      marketPrice,
    );
    return {
      orderType: orderKind.includes('STOP') ? 'stop' : 'limit',
      entry: openPrice,
    };
  }

  private metaApiLimitCovered(
    result:
      | { status: 'placed'; orderType: string; entry: number }
      | { status: 'has_order'; orderType: string; entry: number }
      | { status: 'skipped'; reason: string }
      | { status: 'unavailable' },
  ): boolean {
    return result.status === 'placed' || result.status === 'has_order';
  }

  /** MetaAPI first when configured (user account or platform default), Hub as fallback. */
  private async queueSetupLimitExecution(input: {
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      status: string;
      hubRecordId: string | null;
      hubSenderName: string | null;
      hubOrderNotifiedAt: Date | null;
      entryMin: unknown;
      entryMax: unknown;
      stopLoss: unknown;
      takeProfit: unknown;
      riskRewardRatio: unknown;
      description: string;
      screenshotUrl: string;
      metaApiAccountId: string | null;
      metaApiOrderId: string | null;
      metaApiPositionId: string | null;
      metaApiExecutedAt: Date | null;
      trade: Trade | null;
    };
    user: {
      displayName: string;
      metaApiAccountId: string | null;
      virtualAccount?: {
        riskPercent: unknown;
        maxRiskPerTrade: unknown;
      } | null;
    };
    userId: string;
    dto: CreateSignalDto;
  }): Promise<ForwardSignalResult> {
    const { signal, user, userId, dto } = input;

    if (this.metaApi.isConfigured) {
      const metaResult = await this.ensureMetaApiPendingLimitForSetup(
        signal,
        user,
        userId,
      );
      if (this.metaApiLimitCovered(metaResult)) {
        const order =
          metaResult.status === 'placed' || metaResult.status === 'has_order'
            ? { orderType: metaResult.orderType, entry: metaResult.entry }
            : null;
        return {
          hub: null,
          forwarded: true,
          validation: {
            approved: true,
            adjusted: false,
            issues: ['Limit queued via MetaAPI'],
            sentPrices: order
              ? {
                  symbol: dto.symbol,
                  direction: dto.direction.toLowerCase(),
                  entry: order.entry,
                  sl: dto.stopLoss,
                  tp: dto.takeProfit,
                }
              : undefined,
          },
        };
      }
    }

    if (!this.signalHub.isConfigured) {
      return {
        hub: null,
        forwarded: false,
        hubError: 'Neither MetaAPI nor Signal Hub could queue this setup',
        validation: {
          approved: true,
          adjusted: false,
          issues: [],
        },
      };
    }

    const forwardResult = await this.signalHub.forwardSignal(
      signal.signalId,
      dto,
      user.displayName,
      userId,
    );
    await this.persistHubForward(signal.id, user.displayName, userId, forwardResult);
    return forwardResult;
  }

  private async syncHubLimitForSignal(
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      status: string;
      hubRecordId: string | null;
      hubSenderName: string | null;
      hubOrderNotifiedAt: Date | null;
      entryMin: unknown;
      entryMax: unknown;
      stopLoss: unknown;
      takeProfit: unknown;
      riskRewardRatio: unknown;
      description: string;
      screenshotUrl: string;
      metaApiAccountId: string | null;
      metaApiOrderId: string | null;
      metaApiPositionId: string | null;
      metaApiExecutedAt: Date | null;
      trade: {
        activatedAt: Date | null;
        closedAt: Date | null;
        entryPrice: unknown;
      } | null;
    },
    userId: string,
    user: { displayName: string; metaApiAccountId: string | null },
  ) {
    const evaluation = await this.evaluateActiveSetupHubOrder({
      signal,
      userId,
      user,
    });

    if (evaluation.action === 'skip') return;

    if (evaluation.action === 'has_order') {
      if (!signal.hubOrderNotifiedAt) {
        await this.notifyHubOrderPlaced(signal, userId, evaluation.order);
      }
      return;
    }

    const dto = this.signalToCreateDto(signal);
    const forwardResult = await this.signalHub.forwardSignal(
      signal.signalId,
      dto,
      user.displayName,
      userId,
    );
    await this.persistHubForward(
      signal.id,
      user.displayName,
      userId,
      forwardResult,
    );

    if (forwardResult.forwarded) {
      this.logger.log(`Hub sync placed limit/stop for ${signal.signalId}`);
      await this.maybeNotifyHubOrderPlaced(signal, userId, forwardResult);
    } else {
      this.logger.warn(
        `Hub sync could not place order for ${signal.signalId}: ${forwardResult.hubError}`,
      );
    }
  }

  /** Place pending limit/stop on MetaAPI (user-linked or platform default account). */
  private async ensureMetaApiPendingLimitForSetup(
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      status: string;
      entryMin: unknown;
      entryMax: unknown;
      stopLoss: unknown;
      takeProfit: unknown;
      hubOrderNotifiedAt: Date | null;
      metaApiAccountId: string | null;
      metaApiOrderId: string | null;
      metaApiPositionId: string | null;
      metaApiExecutedAt: Date | null;
      trade: Trade | null;
    },
    user: {
      displayName: string;
      metaApiAccountId: string | null;
      virtualAccount?: {
        riskPercent: unknown;
        maxRiskPerTrade: unknown;
      } | null;
    },
    userId: string,
  ): Promise<
    | { status: 'placed'; orderType: string; entry: number }
    | { status: 'has_order'; orderType: string; entry: number }
    | { status: 'skipped'; reason: string }
    | { status: 'unavailable' }
  > {
    if (!this.metaApi.isConfigured) return { status: 'unavailable' };
    if (!signal.trade) return { status: 'skipped', reason: 'no_trade' };

    const accountId = this.metaApi.resolveAccountId(
      signal.metaApiAccountId ?? user.metaApiAccountId,
    );
    if (!accountId) return { status: 'unavailable' };

    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);
    const sl = Number(signal.stopLoss);
    const tp = Number(signal.takeProfit);
    const oneToOnePrice = computeOneToOnePrice(
      signal.direction,
      entryMin,
      entryMax,
      sl,
    );

    const liveTrade = await this.resolveSetupLiveTrade(
      signal,
      userId,
      user,
      oneToOnePrice,
      null,
    );
    const liveStatus =
      typeof liveTrade?.status === 'string' ? liveTrade.status : undefined;

    let marketPrice: number | null = null;
    try {
      const account = await this.metaApi.getAccount(accountId);
      const price = await this.metaApi.getSymbolPrice(account, signal.symbol);
      marketPrice = signal.direction === 'BUY' ? price.ask : price.bid;
    } catch {
      marketPrice = null;
    }

    if (liveStatus === 'open' || liveStatus === 'pending') {
      const order = this.resolveMetaApiLimitOrderDetails(signal, marketPrice);
      return { status: 'has_order', ...order };
    }

    const account = await this.metaApi.getAccount(accountId);
    const price = await this.metaApi.getSymbolPrice(account, signal.symbol);
    marketPrice = signal.direction === 'BUY' ? price.ask : price.bid;
    const spec = await this.metaApi.getSymbolSpecification(account, signal.symbol);
    const digits = spec.digits ?? 5;
    const openPrice = roundToSymbolDigits(
      resolvePendingOpenPrice(
        signal.direction,
        entryMin,
        entryMax,
        marketPrice,
      ),
      digits,
    );
    const orderKind = resolvePendingOrderType(
      signal.direction,
      openPrice,
      marketPrice,
    );

    const riskPercent = Number(
      user.virtualAccount?.riskPercent ?? RISK_PERCENT,
    );
    const maxRiskAmount = Number(
      user.virtualAccount?.maxRiskPerTrade ?? MAX_RISK_PER_TRADE,
    );
    const { comment, clientId } = buildMetaApiTradeIdentifiers({
      displayName: user.displayName,
      userId,
      signalId: signal.signalId,
      symbol: signal.symbol,
    });
    const sizing = await this.tradeRisk.calculatePositionSize({
      account,
      symbol: signal.symbol,
      direction: signal.direction,
      stopLoss: sl,
      takeProfit: tp,
      riskPercent: Math.max(riskPercent, RISK_PERCENT),
      maxRiskAmount,
      entryPrice: openPrice,
    });

    const { trade } = await this.metaApi.placePendingOrder({
      account,
      symbol: signal.symbol,
      orderKind,
      openPrice,
      volume: sizing.volume,
      stopLoss: sl,
      takeProfit: tp,
      comment,
      clientId,
      price,
      specDigits: digits,
    });

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signal.id },
        data: {
          metaApiAccountId: account.id,
          metaApiOrderId: trade.orderId ?? null,
          metaApiPositionId: trade.positionId ?? trade.orderId ?? null,
          metaApiExecutedAt: now,
        },
      }),
      this.prisma.trade.update({
        where: { signalId: signal.id },
        data: { entryPrice: openPrice },
      }),
    ]);

    const orderType = orderKind.includes('STOP') ? 'stop' : 'limit';
    if (!signal.hubOrderNotifiedAt) {
      await this.notifyHubOrderPlaced(signal, userId, {
        orderType,
        entry: openPrice,
      });
    }

    this.logger.log(
      `MetaAPI sync placed ${orderType} for ${signal.signalId} @ ${openPrice}`,
    );

    await this.mirrorToCopyPool({
      signal,
      user: { id: userId, displayName: user.displayName },
      openPrice,
      pending: true,
      orderKind,
    });

    return { status: 'placed', orderType, entry: openPrice };
  }

  private buildForwardResponse(
    signalId: string,
    submittedAt: Date,
    dto: CreateSignalDto,
    displayName: string,
    userId: string,
    forwardResult: ForwardSignalResult,
    status: 'accepted' | 'resent' | 'resend_failed',
  ) {
    return {
      status,
      signalId,
      submittedAt,
      entryRange: { min: dto.entryMin, max: dto.entryMax },
      execution: {
        forwarded: forwardResult.forwarded,
        hubError:
          forwardResult.hubError ||
          (forwardResult.forwarded
            ? undefined
            : 'Signal Hub did not accept this setup'),
        sendername: this.signalHub.toSenderName(displayName, userId),
        orderType:
          (forwardResult.hub?.payload?.order_type as string | undefined) ||
          undefined,
      },
      executionHub: forwardResult.hub
        ? {
            id: forwardResult.hub.id,
            status: forwardResult.hub.status,
            duplicate: forwardResult.hub.duplicate,
            progress: forwardResult.hub.progress,
          }
        : null,
      executionValidation: {
        approved: forwardResult.validation.approved,
        adjusted: forwardResult.validation.adjusted,
        issues: forwardResult.validation.issues,
        rejectReason: forwardResult.validation.rejectReason,
        sentPrices: forwardResult.validation.sentPrices,
      },
    };
  }

  async getUserSignals(userId: string) {
    return this.prisma.signal.findMany({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async getSignal(signalId: string, userId: string, role: string) {
    const signal = await this.prisma.signal.findUnique({
      where: { signalId },
      include: { trade: true, tradeScore: true },
    });

    if (!signal) throw new BadRequestException('Signal not found');

    if (
      signal.userId !== userId &&
      role !== 'ADMIN' &&
      role !== 'MODERATOR'
    ) {
      throw new ForbiddenException('You do not have access to this signal');
    }

    return signal;
  }

  async getOpenSignals(userId: string) {
    return this.prisma.signal.findMany({
      where: { userId, status: 'OPEN' },
      include: { trade: true },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async getOpenSignalsWithResolution(userId: string) {
    const open = await this.getOpenSignals(userId);
    const items = await Promise.all(
      open.map(async (signal) => ({
        id: signal.id,
        signalId: signal.signalId,
        symbol: signal.symbol,
        direction: signal.direction,
        entryMin: Number(signal.entryMin),
        entryMax: Number(signal.entryMax),
        stopLoss: Number(signal.stopLoss),
        takeProfit: Number(signal.takeProfit),
        submittedAt: signal.submittedAt,
        activated: Boolean(signal.trade?.activatedAt),
        resolution: await this.getSetupResolution(userId, signal.signalId),
      })),
    );
    return {
      items,
      count: items.length,
      claimableCount: items.filter((i) => i.resolution.claimable).length,
    };
  }

  async listClaimableTpSetups(userId: string) {
    const open = await this.prisma.signal.findMany({
      where: { userId, status: 'OPEN' },
      include: { trade: true },
      orderBy: { submittedAt: 'desc' },
    });

    const items = await Promise.all(
      open.map(async (signal) => {
        const resolution = await this.getSetupResolution(userId, signal.signalId);
        return {
          signalId: signal.signalId,
          symbol: signal.symbol,
          direction: signal.direction,
          entryMin: Number(signal.entryMin),
          entryMax: Number(signal.entryMax),
          stopLoss: Number(signal.stopLoss),
          takeProfit: Number(signal.takeProfit),
          submittedAt: signal.submittedAt.toISOString(),
          oneToOnePrice: resolution.oneToOnePrice,
          currentPrice: resolution.currentPrice ?? resolution.metaApiPrice ?? null,
          canClaimFullTp: Boolean(resolution.canClaimTp),
          canClaimTp1R1: Boolean(resolution.canClaimTp1R1),
          claimable: Boolean(resolution.canClaimTp || resolution.canClaimTp1R1),
          executionPhase: resolution.executionPhase,
          executionLabel: resolution.executionLabel,
          breakevenSet: Boolean(resolution.breakevenSet),
          tp1ClaimBlockedReason: resolution.tp1ClaimBlockedReason,
        };
      }),
    );

    const claimable = items.filter((i) => i.claimable);

    return {
      items: claimable,
      count: claimable.length,
    };
  }

  /** Admin: manually queue limit/stop for a submitted OPEN setup (MetaAPI first, Hub fallback). */
  async adminSetSetupLimit(signalId: string) {
    const signal = await this.prisma.signal.findFirst({
      where: { signalId },
      include: {
        trade: true,
        user: {
          select: {
            displayName: true,
            metaApiAccountId: true,
            status: true,
            registrationPaid: true,
            virtualAccount: {
              select: { riskPercent: true, maxRiskPerTrade: true },
            },
          },
        },
      },
    });

    if (!signal) throw new NotFoundException('Setup not found');
    if (!signal.user || !signal.trade) {
      throw new BadRequestException('Setup has no trader or trade record');
    }
    if (signal.status !== 'OPEN') {
      throw new BadRequestException(
        `Only OPEN setups can receive limits (current: ${signal.status})`,
      );
    }
    if (signal.trade.closedAt) {
      throw new BadRequestException('This trade is already closed');
    }
    if (signal.trade.activatedAt) {
      throw new BadRequestException(
        'This setup already has a running trade — cannot place a new limit',
      );
    }

    const metaEnabled = this.metaApi.isConfigured;
    const hubEnabled = this.signalHub.isConfigured;
    if (!metaEnabled && !hubEnabled) {
      throw new ServiceUnavailableException(
        'Neither MetaAPI nor Signal Hub is configured',
      );
    }

    if (metaEnabled) {
      const metaResult = await this.ensureMetaApiPendingLimitForSetup(
        signal,
        signal.user,
        signal.userId,
      );
      if (metaResult.status === 'placed') {
        return {
          ok: true,
          signalId,
          channel: 'metaapi' as const,
          outcome: 'placed' as const,
          orderType: metaResult.orderType,
          entry: metaResult.entry,
          message: `MetaAPI ${metaResult.orderType} placed @ ${metaResult.entry}`,
        };
      }
      if (metaResult.status === 'has_order') {
        return {
          ok: true,
          signalId,
          channel: 'metaapi' as const,
          outcome: 'already_active' as const,
          orderType: metaResult.orderType,
          entry: metaResult.entry,
          message:
            'MetaAPI already has a pending or open order for this setup',
        };
      }
    }

    if (hubEnabled) {
      const evaluation = await this.evaluateActiveSetupHubOrder({
        signal,
        userId: signal.userId,
        user: signal.user,
      });

      if (evaluation.action === 'has_order') {
        return {
          ok: true,
          signalId,
          channel: 'hub' as const,
          outcome: 'already_active' as const,
          orderType: evaluation.order.orderType,
          entry: evaluation.order.entry,
          message: 'Signal Hub already has a pending order for this setup',
        };
      }

      if (evaluation.action === 'skip') {
        return {
          ok: false,
          signalId,
          channel: null,
          outcome: 'failed' as const,
          message: evaluation.reason,
        };
      }

      const dto = this.signalToCreateDto(signal);
      const forwardResult = await this.signalHub.forwardSignal(
        signal.signalId,
        dto,
        signal.user.displayName,
        signal.userId,
      );
      await this.persistHubForward(
        signal.id,
        signal.user.displayName,
        signal.userId,
        forwardResult,
      );

      if (forwardResult.forwarded) {
        const order = this.orderDetailsFromForward(forwardResult);
        if (order) {
          await this.notifyHubOrderPlaced(signal, signal.userId, order);
        }
        return {
          ok: true,
          signalId,
          channel: 'hub' as const,
          outcome: 'placed' as const,
          orderType: order?.orderType,
          entry: order?.entry,
          message: 'Limit queued on Signal Hub',
        };
      }

      return {
        ok: false,
        signalId,
        channel: 'hub' as const,
        outcome: 'failed' as const,
        message:
          forwardResult.hubError || 'Signal Hub did not accept this setup',
      };
    }

    return {
      ok: false,
      signalId,
      channel: null,
      outcome: 'failed' as const,
      message: 'MetaAPI could not place a limit and Signal Hub is not configured',
    };
  }

  /**
   * Every minute: ensure OPEN setups have pending limits — MetaAPI first, Hub fallback.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async syncActiveSetupExecutionOrders() {
    const hubEnabled = this.signalHub.isConfigured;
    const metaEnabled = this.metaApi.isConfigured;
    if (!hubEnabled && !metaEnabled) return;

    const candidates = await this.prisma.signal.findMany({
      where: {
        status: 'OPEN',
        trade: { is: { closedAt: null } },
        submittedAt: { lte: new Date(Date.now() - 45 * 1000) },
        user: { status: 'ACTIVE', registrationPaid: true },
      },
      include: {
        trade: true,
        user: {
          select: {
            displayName: true,
            metaApiAccountId: true,
            status: true,
            registrationPaid: true,
            virtualAccount: {
              select: { riskPercent: true, maxRiskPerTrade: true },
            },
          },
        },
      },
      take: 50,
      orderBy: { submittedAt: 'asc' },
    });

    for (const signal of candidates) {
      if (!signal.user || !signal.trade) continue;
      if (!this.isActiveTraderUser(signal.user)) continue;

      try {
        let coveredByMetaApi = false;

        if (metaEnabled) {
          const metaResult = await this.ensureMetaApiPendingLimitForSetup(
            signal,
            signal.user,
            signal.userId,
          );
          coveredByMetaApi = this.metaApiLimitCovered(metaResult);
          if (
            metaResult.status === 'has_order' &&
            !signal.hubOrderNotifiedAt
          ) {
            await this.notifyHubOrderPlaced(signal, signal.userId, {
              orderType: metaResult.orderType,
              entry: metaResult.entry,
            });
          }
        }

        if (hubEnabled && !coveredByMetaApi) {
          await this.syncHubLimitForSignal(
            signal,
            signal.userId,
            signal.user,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Execution sync error for ${signal.signalId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleTp1Reached() {
    const candidates = await this.prisma.signal.findMany({
      where: {
        status: 'OPEN',
        trade: {
          is: {
            tp1NotifiedAt: null,
          },
        },
      },
      include: {
        trade: true,
        user: {
          select: { displayName: true, metaApiAccountId: true },
        },
      },
    });

    if (candidates.length === 0) return;

    for (const signal of candidates) {
        if (!signal.trade || !signal.user) continue;

        try {
          const resolution = await this.getSetupResolution(
            signal.userId,
            signal.signalId,
          );

          if (!('tp1Reached' in resolution) || !resolution.tp1Reached) continue;

          const trade = signal.trade;
          let breakevenApplied = Boolean(trade.tp1BreakevenAt);
          if (!trade.tp1BreakevenAt) {
            await this.prisma.trade.update({
              where: { id: trade.id },
              data: { breakevenPending: true },
            });
            const beResult = await this.recordBreakevenAttempt(
              signal.userId,
              { ...signal, trade },
              signal.user,
            );
            breakevenApplied = beResult.applied;
          }

          const oneToOnePrice = Number(resolution.oneToOnePrice);
          const breakevenPrice =
            trade.entryPrice != null
              ? Number(trade.entryPrice)
              : computeEntryMid(
                  Number(signal.entryMin),
                  Number(signal.entryMax),
                );

          await this.prisma.trade.update({
            where: { id: trade.id },
            data: { tp1NotifiedAt: new Date() },
          });

        const title = `TP1 reached on ${signal.symbol}`;
        const body = breakevenApplied
          ? `Price hit TP1 (1:1 RR at ${oneToOnePrice}). Stop loss was moved to breakeven (${breakevenPrice}). Submit your 1:1 RR claim on TP Claims — no payout or KYC required to claim.`
          : `Price hit TP1 (1:1 RR at ${oneToOnePrice}). Submit your 1:1 RR claim on TP Claims — no payout or KYC required to claim.`;

        await this.platformNotifications.create({
          userId: signal.userId,
          type: 'TP1_REACHED',
          title,
          body,
          linkUrl: '/tp-claims',
          signalId: signal.signalId,
        });

        this.notifications.tp1ClaimAvailable(signal.userId, {
          symbol: signal.symbol,
          signalId: signal.signalId,
          oneToOnePrice,
          breakevenApplied,
          breakevenPrice: breakevenApplied ? breakevenPrice : undefined,
        });
      } catch (err) {
        this.logger.warn(
          `TP1 handling skipped for ${signal.signalId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryPendingBreakeven() {
    const pending = await this.prisma.signal.findMany({
      where: {
        status: 'OPEN',
        trade: {
          is: {
            tp1BreakevenAt: null,
            breakevenPending: true,
            breakevenRetryCount: { lt: MAX_BREAKEVEN_RETRIES },
          },
        },
      },
      include: {
        trade: true,
        user: {
          select: { displayName: true, metaApiAccountId: true },
        },
      },
    });

    for (const signal of pending) {
      if (!signal.trade || !signal.user) continue;
      try {
        const result = await this.recordBreakevenAttempt(
          signal.userId,
          { ...signal, trade: signal.trade },
          signal.user,
        );
        if (result.applied) {
          await this.platformNotifications.create({
            userId: signal.userId,
            type: 'BREAKEVEN_SET',
            title: `Breakeven set on ${signal.symbol}`,
            body: `Stop loss moved to ${result.breakevenPrice} after ${result.retriesUsed} attempt(s).`,
            linkUrl: '/dashboard',
            signalId: signal.signalId,
          });
        } else if (result.retriesRemaining <= 0) {
          await this.platformNotifications.create({
            userId: signal.userId,
            type: 'BREAKEVEN_FAILED',
            title: `Breakeven not set on ${signal.symbol}`,
            body: `Could not move stop to breakeven after ${MAX_BREAKEVEN_RETRIES} attempts — broker may reject until price allows it. Try again from the setup or use Set breakeven when conditions improve.`,
            linkUrl: '/dashboard',
            signalId: signal.signalId,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Breakeven retry skipped for ${signal.signalId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  async setBreakeven(userId: string, signalId: string) {
    await this.compliance.requireActiveTrader(userId);

    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId, status: 'OPEN' },
      include: { trade: true },
    });
    if (!signal?.trade) {
      throw new NotFoundException('Open setup not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, metaApiAccountId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (signal.trade.tp1BreakevenAt) {
      return {
        status: 'already_set' as const,
        applied: true,
        breakevenPrice: Number(signal.trade.stopLoss),
        retriesUsed: signal.trade.breakevenRetryCount,
        retriesRemaining: 0,
        message: 'Breakeven is already set on this setup.',
      };
    }

    if (signal.trade.breakevenRetryCount >= MAX_BREAKEVEN_RETRIES) {
      await this.prisma.trade.update({
        where: { id: signal.trade.id },
        data: { breakevenRetryCount: 0 },
      });
      signal.trade.breakevenRetryCount = 0;
    }

    const resolution = await this.getSetupResolution(userId, signalId);
    const liveTrade = resolution.liveTrade as { status?: string } | null | undefined;
    const canSet =
      liveTrade?.status === 'open' ||
      Boolean(signal.trade.activatedAt) ||
      Boolean(signal.metaApiExecutedAt) ||
      Boolean(signal.hubRecordId);

    if (!canSet) {
      throw new BadRequestException(
        'No live trade found for this setup — breakeven can only be set while a position is open.',
      );
    }

    await this.prisma.trade.update({
      where: { id: signal.trade.id },
      data: { breakevenPending: true },
    });

    const result = await this.recordBreakevenAttempt(
      userId,
      { ...signal, trade: signal.trade },
      user,
    );

    if (result.applied) {
      return {
        status: 'set' as const,
        applied: true,
        breakevenPrice: result.breakevenPrice,
        retriesUsed: result.retriesUsed,
        retriesRemaining: result.retriesRemaining,
        message: `Stop loss moved to breakeven (${result.breakevenPrice}).`,
      };
    }

    return {
      status: 'pending' as const,
      applied: false,
      breakevenPrice: result.breakevenPrice,
      retriesUsed: result.retriesUsed,
      retriesRemaining: result.retriesRemaining,
      message:
        result.retriesRemaining > 0
          ? `Broker did not accept breakeven yet — retrying automatically (${result.retriesUsed}/${MAX_BREAKEVEN_RETRIES} attempts used).`
          : `Could not set breakeven after ${MAX_BREAKEVEN_RETRIES} attempts.`,
    };
  }

  async updateSetupStops(
    userId: string,
    signalId: string,
    dto: UpdateSetupStopsDto,
  ) {
    await this.compliance.requireActiveTrader(userId);

    if (dto.stopLoss === undefined && dto.takeProfit === undefined) {
      throw new BadRequestException('Provide stopLoss and/or takeProfit to update');
    }

    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId, status: 'OPEN' },
      include: { trade: true },
    });
    if (!signal?.trade) {
      throw new NotFoundException('Open setup not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, metaApiAccountId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);
    const nextSl =
      dto.stopLoss !== undefined ? dto.stopLoss : Number(signal.stopLoss);
    const nextTp =
      dto.takeProfit !== undefined ? dto.takeProfit : Number(signal.takeProfit);

    this.validateLiveStopLevels(
      signal.direction,
      entryMin,
      entryMax,
      nextSl,
      nextTp,
    );

    const resolution = await this.getSetupResolution(userId, signalId);
    if (!resolution.canAdjustStops) {
      throw new BadRequestException(
        'Stop levels can only be adjusted while a live order or open position exists for this setup.',
      );
    }

    const live = resolution.liveTrade as {
      status?: string;
      positionId?: string;
      orderId?: string;
      stopLoss?: number;
      takeProfit?: number;
    } | null;

    let metaApplied = false;
    let hubApplied = false;

    const accountId = this.metaApi.resolveAccountId(
      signal.metaApiAccountId ?? user.metaApiAccountId,
    );

    if (this.metaApi.isConfigured && accountId && live) {
      try {
        const account = await this.metaApi.ensureAccountReady(accountId);
        if (live.status === 'open' && live.positionId) {
          await this.metaApi.modifyPositionStops(account, {
            positionId: live.positionId,
            ...(dto.stopLoss !== undefined ? { stopLoss: nextSl } : {}),
            ...(dto.takeProfit !== undefined ? { takeProfit: nextTp } : {}),
          });
          metaApplied = true;
        } else if (live.status === 'pending' && live.orderId) {
          await this.metaApi.modifyPendingOrderStops(account, {
            orderId: live.orderId,
            ...(dto.stopLoss !== undefined ? { stopLoss: nextSl } : {}),
            ...(dto.takeProfit !== undefined ? { takeProfit: nextTp } : {}),
          });
          metaApplied = true;
        }
      } catch (err) {
        this.logger.warn(
          `MetaAPI stop update failed for ${signal.signalId}: ${err instanceof Error ? err.message : err}`,
        );
        if (!signal.hubRecordId) {
          throw new BadRequestException(
            err instanceof BadRequestException
              ? err.message
              : `Broker could not update stops: ${err instanceof Error ? err.message : 'broker rejected'}`,
          );
        }
      }
    }

    if (this.signalHub.isConfigured && signal.hubRecordId) {
      const sendername =
        signal.hubSenderName ||
        this.signalHub.toSenderName(user.displayName, userId);
      const { hub, error } = await this.signalHub.sendHubAction(sendername, {
        action: 'modify',
        external_id: signal.signalId,
        symbol: signal.symbol,
        sl: nextSl,
        tp: nextTp,
      });
      if (hub) hubApplied = true;
      if (error && !metaApplied) {
        throw new BadRequestException(
          `Could not update stops on broker: ${error}`,
        );
      }
    }

    if (!metaApplied && !hubApplied) {
      throw new BadRequestException(
        'No broker connection available to update stop levels for this setup.',
      );
    }

    const rr = this.computeRiskRewardForSetup(
      signal.direction,
      entryMin,
      entryMax,
      nextSl,
      nextTp,
    );

    const slChanged =
      dto.stopLoss !== undefined &&
      Math.abs(nextSl - Number(signal.stopLoss)) > 1e-9;

    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signal.id },
        data: {
          stopLoss: nextSl,
          takeProfit: nextTp,
          riskRewardRatio: rr,
        },
      }),
      this.prisma.trade.update({
        where: { id: signal.trade.id },
        data: {
          stopLoss: nextSl,
          takeProfit: nextTp,
          ...(slChanged ? { tp1BreakevenAt: null, breakevenPending: false } : {}),
        },
      }),
    ]);

    return {
      status: 'updated',
      signalId: signal.signalId,
      stopLoss: nextSl,
      takeProfit: nextTp,
      riskRewardRatio: rr,
      metaApiUpdated: metaApplied,
      hubUpdated: hubApplied,
      brokerStopLoss: live?.stopLoss ?? null,
      brokerTakeProfit: live?.takeProfit ?? null,
      message: `Stop levels updated to SL ${nextSl}, TP ${nextTp}${metaApplied ? ' on broker' : ''}${hubApplied ? ' on Signal Hub' : ''}.`,
    };
  }

  private validateLiveStopLevels(
    direction: TradeDirection,
    entryMin: number,
    entryMax: number,
    stopLoss: number,
    takeProfit: number,
  ) {
    if (!Number.isFinite(stopLoss) || !Number.isFinite(takeProfit)) {
      throw new BadRequestException('Stop loss and take profit must be valid numbers');
    }

    if (direction === 'BUY') {
      if (stopLoss >= entryMin) {
        throw new BadRequestException(
          'For BUY setups, stop loss must be below the entry range',
        );
      }
      if (takeProfit <= entryMax) {
        throw new BadRequestException(
          'For BUY setups, take profit must be above the entry range',
        );
      }
    } else {
      if (stopLoss <= entryMax) {
        throw new BadRequestException(
          'For SELL setups, stop loss must be above the entry range',
        );
      }
      if (takeProfit >= entryMin) {
        throw new BadRequestException(
          'For SELL setups, take profit must be below the entry range',
        );
      }
    }
  }

  private computeRiskRewardForSetup(
    direction: TradeDirection,
    entryMin: number,
    entryMax: number,
    stopLoss: number,
    takeProfit: number,
  ): number {
    void direction;
    const mid = computeEntryMid(entryMin, entryMax);
    const risk = Math.abs(mid - stopLoss);
    const reward = Math.abs(takeProfit - mid);
    if (risk <= 0) return 0;
    return Math.round((reward / risk) * 100) / 100;
  }

  private async recordBreakevenAttempt(
    userId: string,
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      entryMin: unknown;
      entryMax: unknown;
      takeProfit: unknown;
      hubRecordId: string | null;
      hubSenderName: string | null;
      metaApiAccountId: string | null;
      metaApiOrderId: string | null;
      metaApiPositionId: string | null;
      trade: {
        id: string;
        entryPrice: unknown;
        activatedAt: Date | null;
        breakevenRetryCount: number;
      };
    },
    user: { displayName: string; metaApiAccountId: string | null },
  ): Promise<{
    applied: boolean;
    breakevenPrice: number;
    retriesUsed: number;
    retriesRemaining: number;
  }> {
    const attempt = await this.applyBreakevenOnSetup(userId, signal, user);

    if (attempt.applied) {
      await this.prisma.trade.update({
        where: { id: signal.trade.id },
        data: {
          breakevenPending: false,
        },
      });
      const retriesUsed = signal.trade.breakevenRetryCount;
      return {
        applied: true,
        breakevenPrice: attempt.breakevenPrice,
        retriesUsed,
        retriesRemaining: Math.max(0, MAX_BREAKEVEN_RETRIES - retriesUsed),
      };
    }

    const updated = await this.prisma.trade.update({
      where: { id: signal.trade.id },
      data: {
        breakevenRetryCount: { increment: 1 },
        breakevenPending:
          signal.trade.breakevenRetryCount + 1 < MAX_BREAKEVEN_RETRIES,
      },
    });

    const retriesUsed = updated.breakevenRetryCount;
    return {
      applied: false,
      breakevenPrice: attempt.breakevenPrice,
      retriesUsed,
      retriesRemaining: Math.max(0, MAX_BREAKEVEN_RETRIES - retriesUsed),
    };
  }

  private async applyBreakevenOnSetup(
    userId: string,
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      entryMin: unknown;
      entryMax: unknown;
      takeProfit: unknown;
      hubRecordId: string | null;
      hubSenderName: string | null;
      metaApiAccountId: string | null;
      metaApiOrderId: string | null;
      metaApiPositionId: string | null;
      trade: {
        id: string;
        entryPrice: unknown;
        activatedAt: Date | null;
      };
    },
    user: { displayName: string; metaApiAccountId: string | null },
  ): Promise<{ applied: boolean; breakevenPrice: number }> {
    const breakevenPrice =
      signal.trade.entryPrice != null
        ? Number(signal.trade.entryPrice)
        : computeEntryMid(Number(signal.entryMin), Number(signal.entryMax));

    let hubOk = false;
    let metaOk = false;

    if (this.signalHub.isConfigured && signal.hubRecordId) {
      const sendername =
        signal.hubSenderName ||
        this.signalHub.toSenderName(user.displayName, userId);
      const { hub, error } = await this.signalHub.sendHubAction(sendername, {
        action: 'breakeven',
        external_id: signal.signalId,
        symbol: signal.symbol,
      });
      hubOk = Boolean(hub);
      if (error) {
        this.logger.warn(
          `Hub breakeven failed for ${signal.signalId}: ${error}`,
        );
      }
    }

    const accountId = this.metaApi.resolveAccountId(
      signal.metaApiAccountId ?? user.metaApiAccountId,
    );
    if (this.metaApi.isConfigured && accountId) {
      try {
        const account = await this.metaApi.ensureAccountReady(accountId);
        const { clientId } = this.metaApi.buildIdentifiersForUser(
          user.displayName,
          userId,
          signal.signalId,
          signal.symbol,
        );
        const live = await this.metaApi.findLiveTradeForSignal(account, {
          positionId: signal.metaApiPositionId,
          orderId: signal.metaApiOrderId,
          clientId,
          displayName: user.displayName,
          userId,
          symbol: signal.symbol,
          activated: Boolean(signal.trade.activatedAt),
        });

        if (live.status === 'open' && live.positionId) {
          const positions = await this.metaApi.findUserOpenPositions(
            account,
            user.displayName,
            userId,
          );
          const position = positions.find((p) => p.id === live.positionId);
          await this.metaApi.modifyPositionStops(account, {
            positionId: live.positionId,
            stopLoss: breakevenPrice,
            takeProfit:
              position?.takeProfit != null
                ? position.takeProfit
                : Number(signal.takeProfit),
          });
          metaOk = true;
        }
      } catch (err) {
        this.logger.warn(
          `MetaAPI breakeven failed for ${signal.signalId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const applied = hubOk || metaOk;
    if (applied) {
      await this.prisma.$transaction([
        this.prisma.signal.update({
          where: { id: signal.id },
          data: { stopLoss: breakevenPrice },
        }),
        this.prisma.trade.update({
          where: { id: signal.trade.id },
          data: {
            stopLoss: breakevenPrice,
            tp1BreakevenAt: new Date(),
            breakevenPending: false,
          },
        }),
      ]);
      this.logger.log(
        `TP1 breakeven set for ${signal.signalId} @ ${breakevenPrice} (hub=${hubOk}, meta=${metaOk})`,
      );
    }

    return { applied, breakevenPrice };
  }

  async getSetupResolution(userId: string, signalId: string) {
    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId },
      include: { trade: true },
    });
    if (!signal) throw new NotFoundException('Signal not found');

    const tp = Number(signal.takeProfit);
    const sl = Number(signal.stopLoss);
    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);
    const oneToOnePrice = computeOneToOnePrice(
      signal.direction,
      entryMin,
      entryMax,
      sl,
    );
    const tradeProgressOutcome = resolveTradeProgressOutcome(
      signal,
      signal.trade,
    );

    if (signal.status !== 'OPEN') {
      const { phase, label } = resolveSetupExecutionPhase({
        signalStatus: signal.status,
        hubExecuted: false,
        activated: Boolean(signal.trade?.activatedAt),
        partialClosed: Boolean(signal.trade?.partialClosedAt),
        tradeClosedAt: signal.trade?.closedAt,
        canClaimTp: false,
        canClaimTp1R1: false,
        canClaimSl: false,
        pendingTpClaim: false,
        tradeProgressOutcome,
      });

      return {
        signalId: signal.signalId,
        symbol: signal.symbol,
        direction: signal.direction,
        status: signal.status,
        takeProfit: tp,
        stopLoss: sl,
        entryMin,
        entryMax,
        oneToOnePrice,
        riskRewardRatio: Number(signal.riskRewardRatio),
        claimable: false,
        canClaimTp: false,
        canClaimTp1R1: false,
        canClaimSl: false,
        tradeOpened: Boolean(signal.trade?.activatedAt),
        partialClosed: Boolean(signal.trade?.partialClosedAt),
        executionPhase: phase,
        executionLabel: label,
        tradeProgressOutcome,
        resolvedAt: signal.resolvedAt?.toISOString() ?? null,
        exitPrice:
          signal.trade?.exitPrice != null
            ? Number(signal.trade.exitPrice)
            : null,
        pnl: signal.pnl != null ? Number(signal.pnl) : null,
        pointsAwarded: signal.pointsAwarded,
        reason: 'Setup is already resolved',
      };
    }

    const rr1Valid = isOneToOneClaimValidForSetup(
      signal.direction,
      oneToOnePrice,
      tp,
    );

    const trader = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metaApiAccountId: true, displayName: true },
    });
    const linkedAccountId = this.metaApi.resolveAccountId(
      trader?.metaApiAccountId,
    );

    const liveTrade = trader
      ? await this.resolveSetupLiveTrade(
          signal,
          userId,
          trader,
          oneToOnePrice,
          null,
        )
      : null;

    let price = await this.priceMonitor.fetchPrice(signal.symbol);
    let metaApiPrice: number | null =
      liveTrade && typeof liveTrade.currentPrice === 'number'
        ? liveTrade.currentPrice
        : null;

    if (metaApiPrice === null && trader && this.metaApi.isConfigured) {
      metaApiPrice = await this.fetchMetaApiMarkPrice(
        signal,
        trader,
        linkedAccountId,
      );
    }

    if (price === null && metaApiPrice !== null) {
      price = metaApiPrice;
    }

    const priceOutcome =
      price !== null
        ? this.priceMonitor.outcomeAtPrice(signal.direction, tp, sl, price)
        : null;

    let hubStatus: string | null = null;
    let hubOutcome: SetupOutcome | null = null;
    let hubExecuted = false;
    if (this.signalHub.isConfigured && trader) {
      const sendername = this.signalHub.toSenderName(trader.displayName, userId);
      const hub = await this.signalHub.getByExternalId(signal.signalId, sendername);
      hubStatus = hub?.status ?? null;
      hubExecuted = Boolean(hub?.progress?.executed);
      hubOutcome = await this.inferHubOutcome(sendername, hub);

      if (!hubOutcome && hubExecuted && hubStatus === 'failed') {
        hubOutcome = 'sl';
      }
    }

    const canClaimTpBase =
      priceOutcome === 'tp' || (priceOutcome === null && hubOutcome === 'tp');
    const canClaimSlBase =
      priceOutcome === 'sl' || (priceOutcome === null && hubOutcome === 'sl');

    const pendingTpClaim = await this.tpClaims.hasPendingClaim(signal.id);
    const existingFullTpClaim = await this.prisma.tpClaim.findFirst({
      where: {
        signalId: signal.id,
        claimType: 'FULL_TP',
        status: { not: 'REJECTED' },
      },
    });
    const existingRr1Claim = await this.prisma.tpClaim.findFirst({
      where: {
        signalId: signal.id,
        claimType: 'RR_1_TO_1',
        status: { not: 'REJECTED' },
      },
    });
    const activated =
      Boolean(signal.trade?.activatedAt) ||
      liveTrade?.status === 'open' ||
      liveTrade?.status === 'pending';
    const partialClosed = Boolean(signal.trade?.partialClosedAt);
    const breakevenSet = Boolean(signal.trade?.tp1BreakevenAt);
    const hitRr1 =
      (price !== null &&
        priceReachedOneToOne(signal.direction, oneToOnePrice, price)) ||
      Boolean(liveTrade?.tp1Reached);
    const tp1Eligible =
      (hitRr1 || partialClosed) && breakevenSet;
    const canClaimTp =
      canClaimTpBase && !pendingTpClaim && !existingFullTpClaim;
    const canClaimTp1R1 =
      !canClaimTpBase &&
      tp1Eligible &&
      rr1Valid &&
      activated &&
      Number(signal.riskRewardRatio) >= 1 &&
      !pendingTpClaim &&
      !existingRr1Claim;
    const canClaimSl = canClaimSlBase;
    const tp1Reached =
      !canClaimTpBase &&
      (hitRr1 || partialClosed) &&
      rr1Valid &&
      activated &&
      Number(signal.riskRewardRatio) >= 1;
    const tp1ClaimBlockedReason = resolveTp1ClaimBlockedReason({
      hitRr1,
      partialClosed,
      breakevenSet,
      breakevenPending: Boolean(signal.trade?.breakevenPending),
      rr1Valid,
      activated,
      canClaimTpBase,
      pendingTpClaim,
      existingRr1Claim: Boolean(existingRr1Claim),
    });

    const { canInvalidate, invalidateBlockedReason } =
      this.resolveInvalidateEligibility({
        liveTrade,
        hubExecuted,
        hubStatus,
        hubRecordId: signal.hubRecordId,
      });

    const { phase, label } = resolveSetupExecutionPhase({
      signalStatus: signal.status,
      hubRecordId: signal.hubRecordId,
      hubStatus,
      hubExecuted,
      liveTradeStatus:
        typeof liveTrade?.status === 'string' ? liveTrade.status : undefined,
      activated,
      partialClosed,
      tradeClosedAt: signal.trade?.closedAt,
      canClaimTp,
      canClaimTp1R1,
      canClaimSl,
      pendingTpClaim,
      tradeProgressOutcome,
    });

    return {
      signalId: signal.signalId,
      symbol: signal.symbol,
      direction: signal.direction,
      status: signal.status,
      takeProfit: tp,
      stopLoss: sl,
      entryMin,
      entryMax,
      oneToOnePrice,
      riskRewardRatio: Number(signal.riskRewardRatio),
      activated,
      tradeOpened: activated,
      partialClosed,
      executionPhase: phase,
      executionLabel: label,
      tradeProgressOutcome,
      currentPrice: price,
      metaApiPrice,
      priceOutcome,
      hubStatus,
      hubOutcome,
      pendingTpClaim,
      claimable: canClaimTp || canClaimSl || canClaimTp1R1,
      canClaimTp,
      canClaimTp1R1,
      canClaimSl,
      tp1Reached,
      tp1ClaimBlockedReason,
      breakevenSet,
      breakevenPending: Boolean(signal.trade?.breakevenPending),
      breakevenRetryCount: signal.trade?.breakevenRetryCount ?? 0,
      canSetBreakeven:
        Boolean(signal.trade) &&
        !signal.trade?.tp1BreakevenAt &&
        (signal.trade?.breakevenRetryCount ?? 0) < MAX_BREAKEVEN_RETRIES &&
        (activated ||
          liveTrade?.status === 'open' ||
          Boolean(signal.metaApiExecutedAt) ||
          Boolean(signal.hubRecordId)),
      canAdjustStops:
        signal.status === 'OPEN' &&
        Boolean(signal.trade) &&
        (liveTrade?.status === 'open' ||
          liveTrade?.status === 'pending' ||
          Boolean(signal.trade?.activatedAt) ||
          Boolean(signal.metaApiExecutedAt) ||
          Boolean(signal.hubRecordId)),
      metaApiExecuted: Boolean(signal.metaApiExecutedAt),
      metaApiOrderId: signal.metaApiOrderId,
      metaApiPositionId: signal.metaApiPositionId,
      canPlaceTrade:
        signal.status === 'OPEN' &&
        !signal.metaApiExecutedAt &&
        this.metaApi.isConfigured &&
        Boolean(linkedAccountId),
      canCloseTrade:
        liveTrade?.status === 'open' ||
        liveTrade?.status === 'pending' ||
        ((Boolean(signal.metaApiExecutedAt) || hubExecuted) &&
          this.metaApi.isConfigured &&
          Boolean(linkedAccountId)),
      liveTrade,
      canInvalidate,
      invalidateBlockedReason,
    };
  }

  private resolveInvalidateEligibility(input: {
    liveTrade: Record<string, unknown> | null;
    hubExecuted: boolean;
    hubStatus: string | null;
    hubRecordId: string | null;
  }): { canInvalidate: boolean; invalidateBlockedReason?: string } {
    const liveStatus = input.liveTrade?.status;

    if (liveStatus === 'open') {
      return {
        canInvalidate: false,
        invalidateBlockedReason:
          'You have a live position on this setup. Close the trade first, then you can invalidate.',
      };
    }

    if (liveStatus === 'pending') {
      return {
        canInvalidate: false,
        invalidateBlockedReason:
          'You have a pending order on this setup. Cancel it with Close trade first.',
      };
    }

    if (input.hubExecuted) {
      return {
        canInvalidate: false,
        invalidateBlockedReason:
          'Signal Hub has an active trade on this setup. Wait for TP/SL or close the position before invalidating.',
      };
    }

    if (input.hubRecordId) {
      const status = (input.hubStatus ?? '').toLowerCase();
      const terminal = [
        'invalidated',
        'failed',
        'cancelled',
        'canceled',
        'closed',
        'rejected',
        'expired',
        'done',
        'not_found',
      ];
      if (status && !terminal.some((t) => status.includes(t))) {
        return {
          canInvalidate: false,
          invalidateBlockedReason:
            'Signal Hub still has a pending order for this setup. Wait for it to fill or cancel on Hub before invalidating.',
        };
      }
    }

    return { canInvalidate: true };
  }

  private async assertSetupCanInvalidate(
    userId: string,
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      status: string;
      hubRecordId: string | null;
      hubSenderName: string | null;
      metaApiAccountId: string | null;
      metaApiOrderId: string | null;
      metaApiPositionId: string | null;
      metaApiExecutedAt: Date | null;
      entryMin: unknown;
      entryMax: unknown;
      stopLoss: unknown;
      trade: { activatedAt: Date | null; entryPrice: unknown } | null;
    },
    user: { displayName: string; metaApiAccountId: string | null },
  ) {
    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);
    const sl = Number(signal.stopLoss);
    const oneToOnePrice = computeOneToOnePrice(
      signal.direction,
      entryMin,
      entryMax,
      sl,
    );

    const liveTrade = await this.resolveSetupLiveTrade(
      signal,
      userId,
      user,
      oneToOnePrice,
      null,
    );

    let hubExecuted = false;
    let hubStatus: string | null = null;
    if (this.signalHub.isConfigured) {
      const sendername =
        signal.hubSenderName ||
        this.signalHub.toSenderName(user.displayName, userId);
      const hub = await this.signalHub.getByExternalId(
        signal.signalId,
        sendername,
      );
      hubStatus = hub?.status ?? null;
      hubExecuted = Boolean(hub?.progress?.executed);
    }

    const { canInvalidate, invalidateBlockedReason } =
      this.resolveInvalidateEligibility({
        liveTrade,
        hubExecuted,
        hubStatus,
        hubRecordId: signal.hubRecordId,
      });

    if (!canInvalidate) {
      throw new BadRequestException(
        invalidateBlockedReason ??
          'This setup has a running order or open trade and cannot be invalidated.',
      );
    }
  }

  private async fetchMetaApiMarkPrice(
    signal: { symbol: string; direction: TradeDirection; metaApiAccountId: string | null },
    trader: { metaApiAccountId: string | null },
    linkedAccountId: string | null,
  ): Promise<number | null> {
    const accountId = signal.metaApiAccountId ?? linkedAccountId;
    if (!accountId) return null;

    try {
      const account = await this.metaApi.getAccount(accountId);
      return await this.metaApi.getMarkPrice(
        account,
        signal.symbol,
        signal.direction,
      );
    } catch (err) {
      this.logger.warn(
        `MetaAPI mark price failed for ${signal.symbol}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async verifyMetaApiTpClaim(
    userId: string,
    signal: {
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      entryMin: unknown;
      entryMax: unknown;
      stopLoss: unknown;
      takeProfit: unknown;
      metaApiAccountId: string | null;
      metaApiOrderId: string | null;
      metaApiPositionId: string | null;
      trade: { activatedAt: Date | null } | null;
    },
    user: { displayName: string; metaApiAccountId: string | null },
    options: { fullTp: boolean },
  ): Promise<{ metaApiClosed?: boolean }> {
    if (!this.metaApi.isConfigured) return {};

    const accountId = this.metaApi.resolveAccountId(
      signal.metaApiAccountId ?? user.metaApiAccountId,
    );
    if (!accountId) return {};

    const tp = Number(signal.takeProfit);
    const account = await this.metaApi.getAccount(accountId);
    const mark = await this.metaApi.getMarkPrice(
      account,
      signal.symbol,
      signal.direction,
    );

    if (options.fullTp) {
      const tpReached =
        signal.direction === 'BUY' ? mark >= tp : mark <= tp;
      if (!tpReached) {
        throw new BadRequestException(
          `Live price (${mark}) has not reached take profit (${tp}) yet`,
        );
      }

      const closeResult = await this.metaApi.closeSignalTradeIfOpen({
        accountId,
        displayName: user.displayName,
        userId,
        signalId: signal.signalId,
        symbol: signal.symbol,
        metaApiPositionId: signal.metaApiPositionId,
        metaApiOrderId: signal.metaApiOrderId,
        tradeActivated: Boolean(signal.trade?.activatedAt),
      });

      return { metaApiClosed: closeResult.action === 'closed' };
    }

    const oneToOne = computeOneToOnePrice(
      signal.direction,
      Number(signal.entryMin),
      Number(signal.entryMax),
      Number(signal.stopLoss),
    );
    const rr1Reached = priceReachedOneToOne(
      signal.direction,
      oneToOne,
      mark,
    );
    if (!rr1Reached) {
      throw new BadRequestException(
        `Live price (${mark}) has not reached 1:1 RR (${oneToOne}) yet`,
      );
    }

    return {};
  }

  /** Lightweight MetaAPI poll — live P/L only, no Hub or claim resolution. */
  async getSetupLiveTrade(userId: string, signalId: string) {
    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId },
      include: { trade: true },
    });
    if (!signal) throw new NotFoundException('Signal not found');
    if (signal.status !== 'OPEN') {
      return { signalId: signal.signalId, liveTrade: null };
    }

    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);
    const sl = Number(signal.stopLoss);
    const oneToOnePrice = computeOneToOnePrice(
      signal.direction,
      entryMin,
      entryMax,
      sl,
    );

    const trader = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metaApiAccountId: true, displayName: true },
    });
    if (!trader) throw new NotFoundException('User not found');

    const liveTrade = await this.resolveSetupLiveTrade(
      signal,
      userId,
      trader,
      oneToOnePrice,
      null,
    );

    return { signalId: signal.signalId, liveTrade };
  }

  private async resolveSetupLiveTrade(
    signal: {
      id: string;
      signalId: string;
      symbol: string;
      direction: TradeDirection;
      status: string;
      metaApiAccountId: string | null;
      metaApiOrderId: string | null;
      metaApiPositionId: string | null;
      metaApiExecutedAt: Date | null;
      trade: { activatedAt: Date | null; entryPrice: unknown } | null;
    },
    userId: string,
    trader: { displayName: string; metaApiAccountId: string | null },
    oneToOnePrice: number,
    markPrice: number | null,
  ): Promise<Record<string, unknown> | null> {
    const linkedAccountId = this.metaApi.resolveAccountId(
      trader.metaApiAccountId,
    );

    if (
      signal.status !== 'OPEN' ||
      !this.metaApi.isConfigured ||
      !(signal.metaApiAccountId || linkedAccountId)
    ) {
      return null;
    }

    try {
      const accountId = signal.metaApiAccountId ?? linkedAccountId!;
      const account = await this.metaApi.getAccount(accountId);
      const { clientId } = this.metaApi.buildIdentifiersForUser(
        trader.displayName,
        userId,
        signal.signalId,
        signal.symbol,
      );
      const live = await this.metaApi.findLiveTradeForSignal(account, {
        positionId: signal.metaApiPositionId,
        orderId: signal.metaApiOrderId,
        clientId,
        displayName: trader.displayName,
        userId,
        symbol: signal.symbol,
        activated: Boolean(signal.trade?.activatedAt),
      });

      const priceForTp1 =
        markPrice ??
        live.currentPrice ??
        null;
      const tp1Reached =
        priceForTp1 !== null &&
        priceReachedOneToOne(signal.direction, oneToOnePrice, priceForTp1);

      return {
        ...live,
        tp1Price: oneToOnePrice,
        tp1Reached,
        entryPrice:
          live.openPrice ??
          (signal.trade?.entryPrice != null
            ? Number(signal.trade.entryPrice)
            : undefined),
        canClose: live.status === 'open' || live.status === 'pending',
      };
    } catch (err) {
      this.logger.warn(
        `Live trade state failed for ${signal.signalId}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async closeSetupTrade(userId: string, signalId: string) {
    await this.compliance.requireActiveTrader(userId);

    if (!this.metaApi.isConfigured) {
      throw new ServiceUnavailableException('Live trading is not configured');
    }

    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId, status: 'OPEN' },
      include: { trade: true },
    });
    if (!signal) throw new NotFoundException('Open setup not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const accountId = this.metaApi.resolveAccountId(
      signal.metaApiAccountId ?? user.metaApiAccountId,
    );
    if (!accountId) {
      throw new BadRequestException('No trading account linked');
    }

    const account = await this.metaApi.ensureAccountReady(accountId);
    const { clientId } = this.metaApi.buildIdentifiersForUser(
      user.displayName,
      userId,
      signal.signalId,
      signal.symbol,
    );
    const live = await this.metaApi.findLiveTradeForSignal(account, {
      positionId: signal.metaApiPositionId,
      orderId: signal.metaApiOrderId,
      clientId,
      displayName: user.displayName,
      userId,
      symbol: signal.symbol,
      activated: Boolean(signal.trade?.activatedAt),
    });

    if (live.status === 'none') {
      throw new BadRequestException(
        'No open position with your name in the trade comment was found for this setup',
      );
    }

    const entryMin = Number(signal.entryMin);
    const entryMax = Number(signal.entryMax);
    const tp = Number(signal.takeProfit);
    const sl = Number(signal.stopLoss);
    const oneToOnePrice = computeOneToOnePrice(
      signal.direction,
      entryMin,
      entryMax,
      sl,
    );

    if (live.status === 'pending' && live.orderId) {
      await this.metaApi.cancelPendingOrder(account, live.orderId);
      await this.prisma.signal.update({
        where: { id: signal.id },
        data: {
          metaApiAccountId: null,
          metaApiOrderId: null,
          metaApiPositionId: null,
          metaApiExecutedAt: null,
        },
      });
      return {
        status: 'cancelled',
        signalId: signal.signalId,
        message: 'Pending order cancelled — setup remains open',
      };
    }

    if (!live.positionId) {
      throw new BadRequestException('Could not resolve broker position id');
    }

    const quote = await this.metaApi.getSymbolPrice(account, signal.symbol);
    const exitPrice =
      signal.direction === 'BUY' ? quote.bid : quote.ask;

    await this.metaApi.closePositionById(account, live.positionId);

    await this.priceMonitor.ensureTradeActivated(
      signal.trade!,
      signal,
      live.openPrice ?? exitPrice,
    );

    const hitFullTp =
      this.priceMonitor.outcomeAtPrice(
        signal.direction,
        tp,
        sl,
        exitPrice,
      ) === 'tp';
    const manualOutcome = classifyManualCloseOutcome(
      signal.direction,
      entryMin,
      entryMax,
      oneToOnePrice,
      exitPrice,
    );

    let result: Record<string, unknown>;
    if (manualOutcome === 'tp') {
      result = (await this.wallet.resolveAsManualWin(
        userId,
        signal.id,
        exitPrice,
        { fullTp: hitFullTp },
      )) as Record<string, unknown>;
    } else if (manualOutcome === 'even') {
      result = (await this.wallet.resolveAsEven(
        userId,
        signal.id,
        exitPrice,
      )) as Record<string, unknown>;
    } else {
      result = (await this.wallet.resolveAsLoss(
        userId,
        signal.id,
        exitPrice,
      )) as Record<string, unknown>;
    }

    const scoringPoints =
      result &&
      typeof result === 'object' &&
      'scoring' in result &&
      result.scoring &&
      typeof result.scoring === 'object' &&
      'totalPoints' in result.scoring
        ? Number((result.scoring as { totalPoints: number }).totalPoints)
        : undefined;

    return {
      status: 'closed',
      signalId: signal.signalId,
      exitPrice,
      outcome: manualOutcome,
      fullTp: hitFullTp,
      tp1Price: oneToOnePrice,
      pointsAwarded: scoringPoints,
      message:
        manualOutcome === 'tp'
          ? hitFullTp
            ? 'Trade closed at full TP — counted as a win'
            : 'Trade closed after TP1 (1:1) — counted as a win'
          : manualOutcome === 'even'
            ? 'Trade closed before TP1 — recorded as even (no win/loss points)'
            : 'Trade closed in loss — counted as a loss',
    };
  }

  async claimSetup(userId: string, signalId: string, dto: ClaimSetupDto) {
    await this.compliance.requireActiveTrader(userId);

    const resolution = await this.getSetupResolution(userId, signalId);
    if (!resolution.claimable) {
      throw new BadRequestException(
        resolution.reason ||
          'This setup cannot be claimed yet — market price has not reached TP or SL, and Signal Hub has not marked it complete.',
      );
    }

    const outcome = dto.outcome;
    const isRr1Claim = outcome === 'tp' && dto.tpClaimType === 'rr_1_1';

    if (isRr1Claim) {
      if (!('canClaimTp1R1' in resolution) || !resolution.canClaimTp1R1) {
        throw new BadRequestException(
          ('tp1ClaimBlockedReason' in resolution &&
            resolution.tp1ClaimBlockedReason) ||
            '1:1 RR claim is not available yet — TP1 or partial close with breakeven is required.',
        );
      }
    } else if (outcome === 'tp' && !resolution.canClaimTp) {
      throw new BadRequestException(
        'Take profit has not been reached according to current market data or execution status.',
      );
    }
    if (outcome === 'sl' && !resolution.canClaimSl) {
      throw new BadRequestException(
        'Stop loss has not been reached according to current market data or execution status.',
      );
    }

    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId, status: 'OPEN' },
      include: { trade: true },
    });
    if (!signal || !signal.trade) {
      throw new NotFoundException('Open setup not found');
    }

    const exitPrice =
      isRr1Claim && 'oneToOnePrice' in resolution && resolution.oneToOnePrice != null
        ? Number(resolution.oneToOnePrice)
        : resolution.currentPrice ??
          (outcome === 'tp'
            ? Number(signal.takeProfit)
            : Number(signal.stopLoss));

    if (outcome === 'tp') {
      if (!dto.beforeScreenshotUrl?.trim() || !dto.afterScreenshotUrl?.trim()) {
        throw new BadRequestException(
          'Before and after chart screenshots are required to claim take profit',
        );
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const usesMetaApi =
        this.metaApi.isConfigured &&
        user &&
        Boolean(
          this.metaApi.resolveAccountId(
            signal.metaApiAccountId ?? user.metaApiAccountId,
          ),
        );

      const claimResult = await this.tpClaims.createPendingClaim(
        userId,
        signal,
        exitPrice,
        dto.beforeScreenshotUrl.trim(),
        dto.afterScreenshotUrl.trim(),
        isRr1Claim ? 'RR_1_TO_1' : 'FULL_TP',
      );

      let metaApiNote: string | undefined;
      if (usesMetaApi && user && !isRr1Claim) {
        try {
          const closeResult = await this.metaApi.closeSignalTradeIfOpen({
            accountId: this.metaApi.resolveAccountId(
              signal.metaApiAccountId ?? user.metaApiAccountId,
            )!,
            displayName: user.displayName,
            userId,
            signalId: signal.signalId,
            symbol: signal.symbol,
            metaApiPositionId: signal.metaApiPositionId,
            metaApiOrderId: signal.metaApiOrderId,
            tradeActivated: Boolean(signal.trade?.activatedAt),
          });
          if (closeResult.action === 'closed') {
            metaApiNote = 'Broker position closed at take profit';
          }
        } catch (err) {
          this.logger.warn(
            `Broker close skipped for TP claim ${signal.signalId}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      return {
        ...claimResult,
        ...(metaApiNote ? { metaApiNote } : {}),
      };
    }

    await this.priceMonitor.ensureTradeActivated(
      signal.trade,
      signal,
      exitPrice,
    );

    return this.applySetupOutcome(signal, outcome, exitPrice, 'claim');
  }

  async archiveSetup(userId: string, signalId: string) {
    await this.compliance.requireActiveTrader(userId);

    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId, status: 'OPEN' },
      include: { trade: true },
    });
    if (!signal) {
      throw new NotFoundException('Open setup not found');
    }

    await this.applyArchiveToOpenSignal(signal);

    this.logger.log(`Setup archived: ${signal.signalId} by ${userId}`);

    return {
      status: 'archived',
      signalId: signal.signalId,
    };
  }

  async archiveAllSetups(userId: string) {
    await this.compliance.requireActiveTrader(userId);

    const open = await this.prisma.signal.findMany({
      where: { userId, status: 'OPEN' },
      include: { trade: true },
    });

    if (open.length === 0) {
      return { archivedCount: 0, signalIds: [] as string[] };
    }

    for (const signal of open) {
      await this.applyArchiveToOpenSignal(signal);
    }

    this.logger.log(`Archived ${open.length} setup(s) for ${userId}`);

    return {
      archivedCount: open.length,
      signalIds: open.map((s) => s.signalId),
    };
  }

  async listArchivedSetups(userId: string, limit = 50) {
    await this.compliance.requireActiveTrader(userId);
    const take = Math.min(Math.max(limit, 1), 100);

    const items = await this.prisma.signal.findMany({
      where: {
        userId,
        status: { in: ['ARCHIVED', 'CANCELLED'] },
      },
      orderBy: { resolvedAt: 'desc' },
      take,
      select: {
        id: true,
        signalId: true,
        symbol: true,
        direction: true,
        status: true,
        entryMin: true,
        entryMax: true,
        stopLoss: true,
        takeProfit: true,
        submittedAt: true,
        resolvedAt: true,
      },
    });

    return {
      items: items.map((row) => ({
        ...row,
        entryMin: Number(row.entryMin),
        entryMax: Number(row.entryMax),
        stopLoss: Number(row.stopLoss),
        takeProfit: Number(row.takeProfit),
      })),
      count: items.length,
    };
  }

  private async applyArchiveToOpenSignal(
    signal: Signal & { trade: Trade | null },
  ) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signal.id },
        data: {
          status: 'ARCHIVED',
          resolvedAt: now,
        },
      }),
      ...(signal.trade
        ? [
            this.prisma.trade.update({
              where: { id: signal.trade.id },
              data: { closedAt: now },
            }),
          ]
        : []),
    ]);
  }

  async invalidateSetup(
    userId: string,
    signalId: string,
    reason?: string,
  ) {
    await this.compliance.requireActiveTrader(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId, status: 'OPEN' },
      include: { trade: true },
    });
    if (!signal) {
      throw new NotFoundException('Open setup not found');
    }

    await this.assertSetupCanInvalidate(userId, signal, user);

    let hub: Record<string, unknown> | null = null;
    let hubWarning: string | undefined;
    let hubNotFound = false;

    if (this.signalHub.isConfigured) {
      const currentSender = this.signalHub.toSenderName(
        user.displayName,
        userId,
      );
      const sendername = signal.hubSenderName || currentSender;
      const alternates = [
        currentSender,
        `trader_${userId.slice(0, 8)}`,
      ].filter((name) => name !== sendername);

      const result = await this.signalHub.invalidateByExternalId(
        signal.signalId,
        sendername,
        reason,
        alternates,
      );
      if (result.data) {
        hub = result.data as Record<string, unknown>;
      } else if (result.notOnHub && signal.hubRecordId) {
        const byId = await this.signalHub.invalidateByHubId(
          signal.hubRecordId,
          sendername,
          reason,
        );
        if (byId.data) {
          hub = byId.data as Record<string, unknown>;
        } else if (byId.error && !byId.error.includes('404')) {
          hubWarning = byId.error;
        } else {
          hubNotFound = true;
        }
      } else if (result.notOnHub) {
        hubNotFound = true;
      } else if (result.error) {
        hubWarning = result.error;
      }
    }

    const now = new Date();
    const note =
      reason?.trim() ||
      'Setup invalidated by trader — pending Hub execution cancelled';

    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signal.id },
        data: {
          status: 'ARCHIVED',
          resolvedAt: now,
        },
      }),
      ...(signal.trade
        ? [
            this.prisma.trade.update({
              where: { id: signal.trade.id },
              data: { closedAt: now },
            }),
          ]
        : []),
      this.prisma.tpClaim.updateMany({
        where: { signalId: signal.id, status: 'PENDING_REVIEW' },
        data: {
          status: 'REJECTED',
          adminNote: note,
          reviewedAt: now,
        },
      }),
    ]);

    this.logger.log(
      `Setup invalidated: ${signal.signalId} by ${userId}${hubWarning ? ` (hub: ${hubWarning})` : ''}`,
    );

    return {
      status: 'archived',
      signalId: signal.signalId,
      hub,
      hubNotFound,
      hubWarning,
    };
  }

  async handleTradeLifecycleWebhook(dto: TradeLifecycleWebhookDto) {
    const items = this.extractLifecycleItems(dto);
    const results: Record<string, unknown>[] = [];

    for (const item of items) {
      results.push(await this.processTradeLifecycleItem(item));
    }

    if (results.length === 1) {
      return results[0];
    }

    return {
      processed: results.length,
      results,
    };
  }

  private extractLifecycleItems(
    dto: TradeLifecycleWebhookDto,
  ): TradeLifecycleItemDto[] {
    if (dto.trades?.length) {
      return dto.trades;
    }

    if (dto.event) {
      const sender = dto.sender?.trim() || dto.sendername?.trim();
      if (!sender) {
        throw new BadRequestException(
          'sender (or sendername) is required for each trade event',
        );
      }

      return [
        {
          event: dto.event,
          sender,
          sendername: dto.sendername,
          signalId: dto.signalId,
          external_id: dto.external_id,
          symbol: dto.symbol,
          direction: dto.direction,
          entry: dto.entry,
          sl: dto.sl,
          tp: dto.tp,
          exit_price: dto.exit_price,
          outcome: dto.outcome,
          ticket: dto.ticket,
          opened_at: dto.opened_at,
          closed_at: dto.closed_at,
        },
      ];
    }

    throw new BadRequestException(
      'Send a single trade event (event, sender, signalId) or { "trades": [ ... ] }',
    );
  }

  private async processTradeLifecycleItem(item: TradeLifecycleItemDto) {
    const sender = item.sender?.trim() || item.sendername?.trim();
    if (!sender) {
      throw new BadRequestException('sender is required on each trade event');
    }

    const signal = await this.resolveSignalForLifecycle(item, sender);
    if (!signal) {
      throw new NotFoundException(
        `No matching open setup for sender "${sender}"${
          item.signalId || item.external_id
            ? ` / signal ${item.signalId || item.external_id}`
            : ''
        }`,
      );
    }

    this.assertLifecycleSender(signal.user.displayName, signal.userId, sender);

    if (!signal.trade) {
      throw new BadRequestException('Setup has no associated trade record');
    }

    const event = item.event === 'open' ? 'opened' : item.event;

    if (event === 'opened') {
      return this.handleTradeOpenedEvent(signal, item, sender);
    }

    if (event === 'partial' || event === 'partial_close') {
      return this.handleTradePartialEvent(signal, item, sender);
    }

    return this.handleTradeClosedEvent(signal, item, sender);
  }

  private async resolveSignalForLifecycle(
    item: TradeLifecycleItemDto,
    sender: string,
  ) {
    const externalId = item.signalId?.trim() || item.external_id?.trim();

    if (externalId) {
      const signal = await this.prisma.signal.findUnique({
        where: { signalId: externalId },
        include: { trade: true, user: true },
      });
      return signal;
    }

    const symbol = item.symbol
      ? normalizeChartSymbol(item.symbol)
      : undefined;

    const openSignals = await this.prisma.signal.findMany({
      where: {
        status: 'OPEN',
        ...(symbol ? { symbol } : {}),
      },
      include: { trade: true, user: true },
      orderBy: { submittedAt: 'desc' },
      take: 100,
    });

    const senderLower = sender.toLowerCase();
    return (
      openSignals.find(
        (s) =>
          this.signalHub
            .toSenderName(s.user.displayName, s.user.id)
            .toLowerCase() === senderLower,
      ) ?? null
    );
  }

  private assertLifecycleSender(
    displayName: string,
    userId: string,
    sender: string,
  ) {
    const expected = this.signalHub.toSenderName(displayName, userId);
    if (expected.toLowerCase() !== sender.trim().toLowerCase()) {
      throw new BadRequestException(
        `sender "${sender}" does not match expected "${expected}" for this setup`,
      );
    }
  }

  private async handleTradeOpenedEvent(
    signal: Signal & { trade: Trade | null; user: User },
    item: TradeLifecycleItemDto,
    sender: string,
  ) {
    if (signal.status !== 'OPEN') {
      return {
        status: 'ignored',
        event: 'opened',
        reason: 'already_resolved',
        signalId: signal.signalId,
        sender,
        tradeState: signal.status.toLowerCase(),
      };
    }

    const entryPrice = item.entry;

    const tradeUpdate: {
      entryPrice?: number;
      stopLoss?: number;
      takeProfit?: number;
      activatedAt?: Date;
    } = {};

    if (item.entry != null) tradeUpdate.entryPrice = item.entry;
    if (item.sl != null) tradeUpdate.stopLoss = item.sl;
    if (item.tp != null) tradeUpdate.takeProfit = item.tp;

    if (!signal.trade!.activatedAt) {
      tradeUpdate.activatedAt = item.opened_at
        ? new Date(item.opened_at)
        : new Date();
    }

    if (Object.keys(tradeUpdate).length > 0) {
      await this.prisma.trade.update({
        where: { id: signal.trade!.id },
        data: tradeUpdate,
      });
    }

    const trade = await this.prisma.trade.findUniqueOrThrow({
      where: { id: signal.trade!.id },
    });

    await this.priceMonitor.ensureTradeActivated(
      trade,
      {
        entryMin: signal.entryMin,
        entryMax: signal.entryMax,
      },
      entryPrice,
    );

    this.logger.log(
      `Trade opened via webhook: ${signal.signalId} sender=${sender} entry=${item.entry ?? 'default'}`,
    );

    return {
      status: 'opened',
      event: 'opened',
      signalId: signal.signalId,
      sender,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: item.entry ?? null,
      sl: item.sl ?? Number(signal.stopLoss),
      tp: item.tp ?? Number(signal.takeProfit),
      ticket: item.ticket ?? null,
      tradeState: 'in_trade',
    };
  }

  private async handleTradePartialEvent(
    signal: Signal & { trade: Trade | null; user: User },
    item: TradeLifecycleItemDto,
    sender: string,
  ) {
    if (signal.trade) {
      await this.prisma.trade.update({
        where: { id: signal.trade.id },
        data: {
          partialClosedAt: new Date(),
          ...(item.volume != null
            ? { partialCloseVolume: item.volume }
            : {}),
          ...(item.profit != null
            ? { partialCloseProfit: item.profit }
            : {}),
          activatedAt: signal.trade.activatedAt ?? new Date(),
        },
      });
    }

    this.notifications.tradePartialClose(signal.userId, {
      symbol: signal.symbol,
      signalId: signal.signalId,
      volume: item.volume,
      profit: item.profit,
      exitPrice: item.exit_price,
      message: item.message,
    });

    this.logger.log(
      `Partial close via webhook: ${signal.signalId} sender=${sender}`,
    );

    return {
      status: 'partial',
      event: 'partial_close',
      signalId: signal.signalId,
      sender,
      symbol: signal.symbol,
      volume: item.volume ?? null,
      profit: item.profit ?? null,
      exit_price: item.exit_price ?? null,
      tradeState: 'partial',
    };
  }

  private async handleTradeClosedEvent(
    signal: Signal & { trade: Trade | null },
    item: TradeLifecycleItemDto,
    sender: string,
  ) {
    if (signal.status !== 'OPEN') {
      return {
        status: 'ignored',
        event: 'closed',
        reason: 'already_resolved',
        signalId: signal.signalId,
        sender,
        tradeState: signal.status.toLowerCase(),
        currentStatus: signal.status,
      };
    }

    const tp = Number(signal.takeProfit);
    const sl = Number(signal.stopLoss);
    const exitPrice =
      item.exit_price ??
      (item.outcome === 'tp' ? tp : item.outcome === 'sl' ? sl : undefined);

    if (exitPrice == null) {
      throw new BadRequestException(
        'closed events require exit_price and/or outcome (tp|sl)',
      );
    }

    const outcome =
      item.outcome ??
      this.inferCloseOutcome(
        signal.direction as 'BUY' | 'SELL',
        exitPrice,
        tp,
        sl,
      );

    await this.prisma.tpClaim.updateMany({
      where: { signalId: signal.id, status: 'PENDING_REVIEW' },
      data: {
        status: 'REJECTED',
        adminNote: 'Setup resolved automatically via trade lifecycle webhook',
        reviewedAt: new Date(),
      },
    });

    const trade = await this.prisma.trade.findUniqueOrThrow({
      where: { id: signal.trade!.id },
    });

    await this.priceMonitor.ensureTradeActivated(
      trade,
      {
        entryMin: signal.entryMin,
        entryMax: signal.entryMax,
      },
      item.entry ?? exitPrice,
    );

    const result = await this.applySetupOutcome(
      signal,
      outcome,
      exitPrice,
      'webhook',
    );

    this.logger.log(
      `Trade closed via webhook: ${signal.signalId} sender=${sender} outcome=${outcome}`,
    );

    return {
      ...result,
      event: 'closed',
      sender,
      symbol: item.symbol,
      entry: item.entry ?? null,
      sl: item.sl ?? sl,
      tp: item.tp ?? tp,
      exit_price: exitPrice,
      ticket: item.ticket ?? null,
      tradeState: outcome === 'tp' ? 'won' : 'lost',
      closed_at: item.closed_at ?? new Date().toISOString(),
    };
  }

  private inferCloseOutcome(
    direction: 'BUY' | 'SELL',
    exitPrice: number,
    tp: number,
    sl: number,
  ): SetupOutcome {
    const tpDist = Math.abs(exitPrice - tp);
    const slDist = Math.abs(exitPrice - sl);
    if (tpDist === slDist) {
      return direction === 'BUY'
        ? exitPrice >= tp
          ? 'tp'
          : 'sl'
        : exitPrice <= tp
          ? 'tp'
          : 'sl';
    }
    return tpDist < slDist ? 'tp' : 'sl';
  }

  async handleTradeOutcomeWebhook(
    dto: TradeOutcomeWebhookDto,
    hubPayload?: Record<string, unknown>,
  ) {
    const externalId =
      dto.signalId ||
      dto.external_id ||
      (typeof hubPayload?.external_id === 'string'
        ? hubPayload.external_id
        : undefined);

    if (!externalId) {
      throw new BadRequestException(
        'signalId or external_id is required',
      );
    }

    const signal = await this.prisma.signal.findUnique({
      where: { signalId: externalId },
      include: { trade: true },
    });

    if (!signal) {
      throw new NotFoundException(`Setup not found: ${externalId}`);
    }
    if (signal.status !== 'OPEN') {
      return {
        status: 'ignored',
        reason: 'already_resolved',
        signalId: signal.signalId,
        currentStatus: signal.status,
      };
    }
    if (!signal.trade) {
      throw new BadRequestException('Setup has no associated trade record');
    }

    const outcome =
      dto.outcome ??
      this.outcomeFromHubPayload(hubPayload ?? (dto as Record<string, unknown>));

    if (!outcome) {
      throw new BadRequestException(
        'Could not determine outcome — send outcome ("tp"|"sl") or Hub status (done/failed)',
      );
    }

    const exitPrice =
      dto.exit_price ??
      this.exitPriceFromPayload(hubPayload, signal, outcome) ??
      (outcome === 'tp'
        ? Number(signal.takeProfit)
        : Number(signal.stopLoss));

    await this.priceMonitor.ensureTradeActivated(
      signal.trade,
      signal,
      exitPrice,
    );

    return this.applySetupOutcome(signal, outcome, exitPrice, 'webhook');
  }

  async handleHubCallback(payload: Record<string, unknown>) {
    this.logger.log(
      `Signal Hub callback: ${JSON.stringify(payload).slice(0, 500)}`,
    );

    try {
      return await this.handleTradeOutcomeWebhook(
        {
          external_id:
            typeof payload.external_id === 'string'
              ? payload.external_id
              : undefined,
          status:
            typeof payload.status === 'string' ? payload.status : undefined,
          exit_price: this.readNumeric(payload, 'exit_price'),
        },
        payload,
      );
    } catch (err) {
      this.logger.error(
        `Hub callback failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  verifyWebhookSecret(provided: string | undefined) {
    const expected =
      process.env.TRADE_OUTCOME_WEBHOOK_SECRET?.trim() ||
      process.env.SIGNAL_WEBHOOK_SECRET?.trim();

    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'TRADE_OUTCOME_WEBHOOK_SECRET is not configured on the server',
        );
      }
      return;
    }

    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  private async applySetupOutcome(
    signal: {
      id: string;
      signalId: string;
      userId: string;
      takeProfit: unknown;
      stopLoss: unknown;
      trade: { id: string } | null;
    },
    outcome: SetupOutcome,
    exitPrice: number,
    source: 'claim' | 'webhook',
  ) {
    if (!signal.trade) {
      throw new BadRequestException('Setup has no associated trade record');
    }

    const result =
      outcome === 'tp'
        ? await this.wallet.creditTpReward(signal.userId, signal.id, exitPrice)
        : await this.wallet.resolveAsLoss(signal.userId, signal.id, exitPrice);

    if (!result) {
      throw new BadRequestException(
        'Setup could not be resolved — it may already be closed.',
      );
    }

    const signalRow = await this.prisma.signal.findUnique({
      where: { id: signal.id },
      select: { symbol: true, signalId: true },
    });

    if (signalRow) {
      this.notifications.tradeOutcome(signal.userId, {
        symbol: signalRow.symbol,
        signalId: signalRow.signalId,
        outcome,
        exitPrice,
        reward:
          outcome === 'tp' && 'reward' in result ?
            Number(result.reward)
          : undefined,
        pointsAwarded:
          'scoring' in result ? result.scoring?.totalPoints : undefined,
        source,
      });
    }

    return {
      status: source === 'claim' ? 'claimed' : 'resolved',
      source,
      outcome,
      signalId: signal.signalId,
      exitPrice,
      reward: outcome === 'tp' && 'reward' in result ? result.reward : undefined,
      pointsAwarded:
        'scoring' in result ? result.scoring?.totalPoints : undefined,
    };
  }

  private outcomeFromHubPayload(
    payload: Record<string, unknown> | null | undefined,
  ): SetupOutcome | null {
    if (!payload) return null;

    const explicit = payload.outcome;
    if (explicit === 'tp' || explicit === 'sl') return explicit;

    const result =
      payload.result && typeof payload.result === 'object'
        ? (payload.result as Record<string, unknown>)
        : null;
    const profit = result?.profit;
    if (typeof profit === 'number') {
      return profit >= 0 ? 'tp' : 'sl';
    }

    const progress =
      payload.progress && typeof payload.progress === 'object'
        ? (payload.progress as Record<string, unknown>)
        : null;
    const message = String(progress?.message ?? '').toLowerCase();
    if (/take profit|\btp\b hit|tp reached|closed in profit/.test(message)) {
      return 'tp';
    }
    if (
      /stop loss|\bsl\b hit|sl reached|stopped out|closed in loss/.test(
        message,
      )
    ) {
      return 'sl';
    }

    const status = String(payload.status ?? '').toLowerCase();
    if (status === 'failed') return 'sl';
    if (status === 'done') {
      const stage = String(progress?.stage ?? '').toLowerCase();
      if (/fail|sl|stop/.test(stage)) return 'sl';
      return 'tp';
    }

    return null;
  }

  private exitPriceFromPayload(
    payload: Record<string, unknown> | null | undefined,
    signal: { takeProfit: unknown; stopLoss: unknown },
    outcome: SetupOutcome,
  ): number | undefined {
    if (!payload) return undefined;

    const fromRoot = this.readNumeric(payload, 'exit_price');
    if (fromRoot !== undefined) return fromRoot;

    const result =
      payload.result && typeof payload.result === 'object'
        ? (payload.result as Record<string, unknown>)
        : null;
    const closePrice = this.readNumeric(result ?? {}, 'close_price');
    if (closePrice !== undefined) return closePrice;

    const price = this.readNumeric(result ?? {}, 'price');
    if (price !== undefined) return price;

    return outcome === 'tp'
      ? Number(signal.takeProfit)
      : Number(signal.stopLoss);
  }

  private readNumeric(
    obj: Record<string, unknown> | null | undefined,
    key: string,
  ): number | undefined {
    if (!obj) return undefined;
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }

  private async inferHubOutcome(
    sendername: string,
    hub: {
      id?: string;
      status?: string;
      progress?: { executed?: boolean } | null;
      result?: Record<string, unknown> | null;
    } | null,
  ): Promise<SetupOutcome | null> {
    if (!hub) return null;

    const profit = hub.result?.profit;
    if (typeof profit === 'number') {
      return profit >= 0 ? 'tp' : 'sl';
    }

    if (hub.id) {
      const logs = await this.signalHub.getLogs(sendername, {
        signal_id: hub.id,
        limit: 30,
      });
      for (const log of logs?.items ?? []) {
        const text = `${log.event} ${log.message}`.toLowerCase();
        if (/take profit|\btp\b hit|tp reached|closed in profit/.test(text)) {
          return 'tp';
        }
        if (
          /stop loss|\bsl\b hit|sl reached|stopped out|closed in loss/.test(
            text,
          )
        ) {
          return 'sl';
        }
      }
    }

    if (hub.progress?.executed && hub.status === 'done') {
      return 'tp';
    }

    return null;
  }

  private async hubContext(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (!this.signalHub.isConfigured) {
      throw new ServiceUnavailableException('Signal Hub is not configured');
    }
    return {
      user,
      sendername: this.signalHub.toSenderName(user.displayName, userId),
    };
  }

  async getExecutionStatus(userId: string, signalId: string) {
    const { sendername } = await this.hubContext(userId);
    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId },
    });
    if (!signal) throw new BadRequestException('Signal not found');

    const hub = await this.signalHub.getByExternalId(signal.signalId, sendername);
    if (!hub) {
      throw new ServiceUnavailableException('Could not fetch execution status');
    }
    return hub;
  }

  async getExecutionLogs(
    userId: string,
    filters?: { signal_id?: string; limit?: number; offset?: number },
  ) {
    const { sendername } = await this.hubContext(userId);
    const logs = await this.signalHub.getLogs(sendername, filters);
    if (!logs) {
      throw new ServiceUnavailableException('Could not fetch execution logs');
    }
    return logs;
  }

  async getOpenPositions(userId: string) {
    const { sendername } = await this.hubContext(userId);
    const positions = await this.signalHub.getPositions(sendername);
    if (!positions) {
      throw new ServiceUnavailableException('Could not fetch open positions');
    }
    return positions;
  }

  async closePosition(userId: string, ticket: number) {
    const { sendername } = await this.hubContext(userId);
    const result = await this.signalHub.closePosition(ticket, sendername);
    if (!result) {
      throw new ServiceUnavailableException('Could not close position');
    }
    return result;
  }

  async closeAllPositions(userId: string) {
    const { sendername } = await this.hubContext(userId);
    const result = await this.signalHub.closeAllPositions(sendername);
    if (!result) {
      throw new ServiceUnavailableException('Could not close positions');
    }
    return result;
  }

  async listHubSignals(
    userId: string,
    filters?: {
      status?: string;
      external_id?: string;
      limit?: number;
      offset?: number;
      since?: string;
    },
  ) {
    const { sendername } = await this.hubContext(userId);
    const list = await this.signalHub.listSignals(sendername, filters);
    if (!list) {
      throw new ServiceUnavailableException('Could not fetch hub signals');
    }
    return list;
  }

  getHubHealth() {
    return this.signalHub.getHubHealth();
  }

  async getHubQuote(userId: string, symbol: string) {
    await this.compliance.requireActiveTrader(userId);
    if (!this.signalHub.isConfigured) {
      throw new ServiceUnavailableException('Signal Hub is not configured');
    }
    const quote = await this.signalHub.getQuote(symbol);
    if (!quote) {
      throw new ServiceUnavailableException('Could not fetch live quote from Signal Hub');
    }
    return quote;
  }

  async getHubSignalById(userId: string, hubId: string) {
    const { sendername } = await this.hubContext(userId);
    const hub = await this.signalHub.getSignalByHubId(hubId, sendername);
    if (!hub) {
      throw new NotFoundException('Hub signal not found');
    }
    return hub;
  }

  async sendHubAction(userId: string, dto: HubActionDto) {
    const { sendername } = await this.hubContext(userId);
    const { hub, error } = await this.signalHub.sendHubAction(sendername, dto);
    if (!hub) {
      throw new ServiceUnavailableException(
        error || 'Signal Hub did not accept the action',
      );
    }

    if (dto.action === 'partial_close') {
      this.notifications.tradePartialClose(userId, {
        symbol: dto.symbol?.trim() || 'position',
        signalId: dto.external_id || dto.ticket?.toString() || '—',
        volume: dto.lot,
        message:
          dto.message ||
          `Partial close on ${dto.symbol?.trim() || 'position'} via dashboard`,
      });
    }

    return hub;
  }

  async getHubSenderReport(filters?: {
    days?: number;
    sort?: string;
    min_closed_trades?: number;
    limit?: number;
  }) {
    if (!this.signalHub.isConfigured) {
      throw new ServiceUnavailableException('Signal Hub is not configured');
    }
    const report = await this.signalHub.getSenderReport(filters);
    if (!report) {
      throw new ServiceUnavailableException('Could not fetch sender report from Signal Hub');
    }
    return report;
  }

  async getHubSenderProfitability(filters?: {
    days?: number;
    min_closed_trades?: number;
    limit?: number;
  }) {
    if (!this.signalHub.isConfigured) {
      throw new ServiceUnavailableException('Signal Hub is not configured');
    }
    const report = await this.signalHub.getSenderProfitability(filters);
    if (!report) {
      throw new ServiceUnavailableException(
        'Could not fetch sender profitability from Signal Hub',
      );
    }
    return report;
  }
}
