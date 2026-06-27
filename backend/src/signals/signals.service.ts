import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { CreateSignalDto, ClaimSetupDto, TradeOutcomeWebhookDto, TradeLifecycleItemDto, TradeLifecycleWebhookDto, HubActionDto } from '../common/dto';
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
import { Signal, Trade, User } from '@prisma/client';

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
  ) {}

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

    const forwardResult = await this.signalHub.forwardSignal(
      signal.signalId,
      dto,
      user.displayName,
      userId,
    );

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
    });
    if (!signal) throw new NotFoundException('Signal not found');
    if (signal.status === 'REJECTED_DUPLICATE') {
      throw new BadRequestException('Cannot resend a rejected duplicate signal');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
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

    const forwardResult = await this.signalHub.forwardSignal(
      signal.signalId,
      dto,
      user.displayName,
      userId,
    );

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

  async getSetupResolution(userId: string, signalId: string) {
    const signal = await this.prisma.signal.findFirst({
      where: { signalId, userId },
      include: { trade: true },
    });
    if (!signal) throw new NotFoundException('Signal not found');
    if (signal.status !== 'OPEN') {
      return {
        signalId: signal.signalId,
        status: signal.status,
        claimable: false,
        reason: 'Setup is already resolved',
      };
    }

    const tp = Number(signal.takeProfit);
    const sl = Number(signal.stopLoss);
    const price = await this.priceMonitor.fetchPrice(signal.symbol);
    const priceOutcome =
      price !== null
        ? this.priceMonitor.outcomeAtPrice(signal.direction, tp, sl, price)
        : null;

    let hubStatus: string | null = null;
    let hubOutcome: SetupOutcome | null = null;
    if (this.signalHub.isConfigured) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        const sendername = this.signalHub.toSenderName(user.displayName, userId);
        const hub = await this.signalHub.getByExternalId(signal.signalId, sendername);
        hubStatus = hub?.status ?? null;
        hubOutcome = await this.inferHubOutcome(sendername, hub);

        if (!hubOutcome && hub?.progress?.executed && hubStatus === 'failed') {
          hubOutcome = 'sl';
        }
      }
    }

    const canClaimTpBase =
      priceOutcome === 'tp' || (priceOutcome === null && hubOutcome === 'tp');
    const canClaimSl =
      priceOutcome === 'sl' || (priceOutcome === null && hubOutcome === 'sl');

    const pendingTpClaim = await this.tpClaims.hasPendingClaim(signal.id);
    const canClaimTp = canClaimTpBase && !pendingTpClaim;

    return {
      signalId: signal.signalId,
      symbol: signal.symbol,
      direction: signal.direction,
      status: signal.status,
      takeProfit: tp,
      stopLoss: sl,
      entryMin: Number(signal.entryMin),
      entryMax: Number(signal.entryMax),
      activated: Boolean(signal.trade?.activatedAt),
      currentPrice: price,
      priceOutcome,
      hubStatus,
      hubOutcome,
      pendingTpClaim,
      claimable: canClaimTp || canClaimSl,
      canClaimTp,
      canClaimSl,
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
    if (outcome === 'tp' && !resolution.canClaimTp) {
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
      resolution.currentPrice ??
      (outcome === 'tp'
        ? Number(signal.takeProfit)
        : Number(signal.stopLoss));

    if (outcome === 'tp') {
      if (!dto.beforeScreenshotUrl?.trim() || !dto.afterScreenshotUrl?.trim()) {
        throw new BadRequestException(
          'Before and after chart screenshots are required to claim take profit',
        );
      }

      return this.tpClaims.createPendingClaim(
        userId,
        signal,
        exitPrice,
        dto.beforeScreenshotUrl.trim(),
        dto.afterScreenshotUrl.trim(),
      );
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

    this.logger.log(`Setup archived: ${signal.signalId} by ${userId}`);

    return {
      status: 'archived',
      signalId: signal.signalId,
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
