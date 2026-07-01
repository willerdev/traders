import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignalStatus } from '@prisma/client';
import { computeEntryMid } from '../common/rr.util';

export type SetupFeedItem = {
  signalId: string;
  pair: string;
  symbol: string;
  direction: string;
  entry: {
    min: number;
    max: number;
    mid: number;
  };
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  status: string;
  submittedAt: string;
};

@Injectable()
export class FeedsService {
  constructor(private readonly prisma: PrismaService) {}

  async listSetups(filters?: {
    status?: string;
    symbol?: string;
    since?: string;
    limit?: number;
  }) {
    const take = Math.min(Math.max(filters?.limit ?? 50, 1), 100);
    const statusFilter = this.resolveStatusFilter(filters?.status);

    const where: {
      status?: { in: SignalStatus[] };
      symbol?: { contains: string; mode: 'insensitive' };
      submittedAt?: { gte: Date };
    } = {};

    if (statusFilter) {
      where.status = { in: statusFilter };
    }

    if (filters?.symbol?.trim()) {
      where.symbol = {
        contains: filters.symbol.trim(),
        mode: 'insensitive',
      };
    }

    if (filters?.since) {
      const since = new Date(filters.since);
      if (!Number.isNaN(since.getTime())) {
        where.submittedAt = { gte: since };
      }
    }

    const rows = await this.prisma.signal.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      take,
      select: {
        signalId: true,
        symbol: true,
        direction: true,
        entryMin: true,
        entryMax: true,
        stopLoss: true,
        takeProfit: true,
        riskRewardRatio: true,
        status: true,
        submittedAt: true,
      },
    });

    const items = rows.map((row) => this.mapRow(row));

    return {
      count: items.length,
      items,
    };
  }

  async getSetup(signalId: string) {
    const row = await this.prisma.signal.findUnique({
      where: { signalId },
      select: {
        signalId: true,
        symbol: true,
        direction: true,
        entryMin: true,
        entryMax: true,
        stopLoss: true,
        takeProfit: true,
        riskRewardRatio: true,
        status: true,
        submittedAt: true,
      },
    });

    if (!row) {
      throw new NotFoundException('Setup not found');
    }

    return this.mapRow(row);
  }

  private mapRow(row: {
    signalId: string;
    symbol: string;
    direction: string;
    entryMin: unknown;
    entryMax: unknown;
    stopLoss: unknown;
    takeProfit: unknown;
    riskRewardRatio: unknown;
    status: string;
    submittedAt: Date;
  }): SetupFeedItem {
    const entryMin = Number(row.entryMin);
    const entryMax = Number(row.entryMax);

    return {
      signalId: row.signalId,
      pair: row.symbol,
      symbol: row.symbol,
      direction: row.direction,
      entry: {
        min: entryMin,
        max: entryMax,
        mid: computeEntryMid(entryMin, entryMax),
      },
      stopLoss: Number(row.stopLoss),
      takeProfit: Number(row.takeProfit),
      riskRewardRatio: Number(row.riskRewardRatio),
      status: row.status,
      submittedAt: row.submittedAt.toISOString(),
    };
  }

  private resolveStatusFilter(
    status?: string,
  ): SignalStatus[] | undefined {
    const raw = (status ?? 'OPEN').toUpperCase();
    if (raw === 'ALL') return undefined;
    if (raw === 'ACTIVE') {
      return [SignalStatus.OPEN, SignalStatus.PENDING];
    }

    const allowed: SignalStatus[] = [
      SignalStatus.PENDING,
      SignalStatus.OPEN,
      SignalStatus.WON,
      SignalStatus.LOST,
      SignalStatus.ARCHIVED,
      SignalStatus.CANCELLED,
    ];

    if (allowed.includes(raw as SignalStatus)) {
      return [raw as SignalStatus];
    }

    return [SignalStatus.OPEN];
  }
}
