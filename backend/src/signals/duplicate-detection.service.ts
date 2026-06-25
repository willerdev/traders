import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DUPLICATE_ENTRY_PIP_TOLERANCE,
  DUPLICATE_LOOKBACK_MINUTES,
} from '../common/constants';
import { entryMidpointPipDistance } from '../common/pip.util';
import { TradeDirection } from '@prisma/client';

interface SignalInput {
  symbol: string;
  direction: TradeDirection;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
}

export interface MatchedDuplicateSignal {
  signalId: string;
  traderName: string;
  symbol: string;
  direction: TradeDirection;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  submittedAt: string;
  pipDistance: number;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedSignal?: MatchedDuplicateSignal;
}

@Injectable()
export class DuplicateDetectionService {
  constructor(private prisma: PrismaService) {}

  async checkDuplicate(
    userId: string,
    input: SignalInput,
  ): Promise<DuplicateCheckResult> {
    const recentSignals = await this.prisma.signal.findMany({
      where: {
        symbol: input.symbol,
        direction: input.direction,
        status: { not: 'REJECTED_DUPLICATE' },
        submittedAt: {
          gte: new Date(Date.now() - DUPLICATE_LOOKBACK_MINUTES * 60_000),
        },
        userId: { not: userId },
      },
      include: {
        user: { select: { displayName: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });

    let closest: MatchedDuplicateSignal | undefined;

    for (const signal of recentSignals) {
      const entryMin = Number(signal.entryMin);
      const entryMax = Number(signal.entryMax);
      const pipDistance = entryMidpointPipDistance(
        input.symbol,
        input.entryMin,
        input.entryMax,
        entryMin,
        entryMax,
      );

      if (pipDistance <= DUPLICATE_ENTRY_PIP_TOLERANCE) {
        const match: MatchedDuplicateSignal = {
          signalId: signal.signalId,
          traderName: signal.user.displayName,
          symbol: signal.symbol,
          direction: signal.direction,
          entryMin,
          entryMax,
          stopLoss: Number(signal.stopLoss),
          takeProfit: Number(signal.takeProfit),
          submittedAt: signal.submittedAt.toISOString(),
          pipDistance: Math.round(pipDistance * 10) / 10,
        };

        if (!closest || pipDistance < closest.pipDistance) {
          closest = match;
        }
      }
    }

    return {
      isDuplicate: closest !== undefined,
      matchedSignal: closest,
    };
  }
}
