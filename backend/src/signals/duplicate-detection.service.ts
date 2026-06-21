import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DUPLICATE_THRESHOLD,
  ENTRY_TOLERANCE_PERCENT,
} from '../common/constants';
import { TradeDirection } from '@prisma/client';

interface SignalInput {
  symbol: string;
  direction: TradeDirection;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
}

@Injectable()
export class DuplicateDetectionService {
  constructor(private prisma: PrismaService) {}

  async checkDuplicate(
    userId: string,
    input: SignalInput,
  ): Promise<{ isDuplicate: boolean; similarity: number }> {
    const recentSignals = await this.prisma.signal.findMany({
      where: {
        symbol: input.symbol,
        direction: input.direction,
        status: { not: 'REJECTED_DUPLICATE' },
        submittedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });

    let maxSimilarity = 0;

    for (const signal of recentSignals) {
      if (signal.userId === userId) continue;

      const similarity = this.calculateSimilarity(input, {
        entryMin: Number(signal.entryMin),
        entryMax: Number(signal.entryMax),
        stopLoss: Number(signal.stopLoss),
        takeProfit: Number(signal.takeProfit),
      });

      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    return {
      isDuplicate: maxSimilarity >= DUPLICATE_THRESHOLD,
      similarity: maxSimilarity,
    };
  }

  private calculateSimilarity(
    a: SignalInput,
    b: { entryMin: number; entryMax: number; stopLoss: number; takeProfit: number },
  ): number {
    const aMid = (a.entryMin + a.entryMax) / 2;
    const bMid = (b.entryMin + b.entryMax) / 2;

    const overlap = this.rangeOverlap(
      a.entryMin,
      a.entryMax,
      b.entryMin,
      b.entryMax,
    );
    const aWidth = a.entryMax - a.entryMin || aMid * 0.001;
    const overlapRatio = overlap / aWidth;

    const entryScore =
      overlapRatio >= 1 - ENTRY_TOLERANCE_PERCENT / 100
        ? 1
        : Math.max(0, overlapRatio);

    const midDiff = Math.abs(aMid - bMid) / aMid;
    const midScore =
      midDiff <= ENTRY_TOLERANCE_PERCENT / 100
        ? 1
        : Math.max(0, 1 - midDiff * 10);

    const slDiff = Math.abs(a.stopLoss - b.stopLoss) / a.stopLoss;
    const tpDiff = Math.abs(a.takeProfit - b.takeProfit) / a.takeProfit;
    const slScore = Math.max(0, 1 - slDiff * 5);
    const tpScore = Math.max(0, 1 - tpDiff * 5);

    const blendedEntry = entryScore * 0.6 + midScore * 0.4;
    return blendedEntry * 0.4 + slScore * 0.3 + tpScore * 0.3;
  }

  private rangeOverlap(
    aMin: number,
    aMax: number,
    bMin: number,
    bMax: number,
  ): number {
    const start = Math.max(aMin, bMin);
    const end = Math.min(aMax, bMax);
    return Math.max(0, end - start);
  }
}
