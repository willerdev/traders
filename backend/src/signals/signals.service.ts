import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { CreateSignalDto } from '../common/dto';
import { createHash } from 'crypto';
import { ComplianceService } from '../compliance/compliance.service';
import { SignalHubService } from './signal-hub.service';

@Injectable()
export class SignalsService {
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

    const hubResult = await this.signalHub.forwardSignal(
      signal.signalId,
      dto,
      user.displayName,
      userId,
    );

    return {
      status: 'accepted',
      signalId: signal.signalId,
      submittedAt: signal.submittedAt,
      entryRange: { min: dto.entryMin, max: dto.entryMax },
      executionHub: hubResult
        ? {
            id: hubResult.id,
            status: hubResult.status,
            duplicate: hubResult.duplicate,
          }
        : null,
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
}
