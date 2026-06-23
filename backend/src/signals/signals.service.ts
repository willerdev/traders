import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { CreateSignalDto } from '../common/dto';
import { createHash } from 'crypto';
import { ComplianceService } from '../compliance/compliance.service';
import { ForwardSignalResult, SignalHubService } from './signal-hub.service';
import { normalizeChartSymbol } from '../ai/chart-setup.util';

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    private prisma: PrismaService,
    private duplicateDetection: DuplicateDetectionService,
    private compliance: ComplianceService,
    private signalHub: SignalHubService,
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

    const { isDuplicate, similarity } =
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

    if (isDuplicate) {
      await this.prisma.violation.create({
        data: {
          userId,
          type: 'DUPLICATE_SIGNAL',
          description: `Duplicate signal detected (${(similarity * 100).toFixed(1)}% similarity)`,
          evidence: { dto: { ...dto }, similarity } as object,
        },
      });

      const rejected = await this.prisma.signal.create({
        data: { ...signalData, status: 'REJECTED_DUPLICATE' },
      });

      return { status: 'duplicate_signal', signalId: rejected.signalId };
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

  async getSignal(signalId: string) {
    const signal = await this.prisma.signal.findUnique({
      where: { signalId },
      include: { trade: true, tradeScore: true },
    });

    if (!signal) throw new BadRequestException('Signal not found');
    return signal;
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

  async handleHubCallback(payload: Record<string, unknown>) {
    this.logger.log(
      `Signal Hub callback: ${JSON.stringify(payload).slice(0, 500)}`,
    );
    return { ok: true };
  }

  getHubHealth() {
    return this.signalHub.getHubHealth();
  }
}
