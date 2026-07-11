import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EvaluationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetaApiService } from '../metaapi/metaapi.service';
import { EvaluationsService } from './evaluations.service';

@Injectable()
export class EvaluationMonitorService {
  private readonly logger = new Logger(EvaluationMonitorService.name);

  constructor(
    private prisma: PrismaService,
    private metaApi: MetaApiService,
    private evaluations: EvaluationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async monitorActiveEnrollments() {
    if (!this.metaApi.isConfigured) return;

    const active = await this.prisma.evaluationEnrollment.findMany({
      where: { status: EvaluationStatus.ACTIVE },
      take: 100,
    });

    for (const row of active) {
      try {
        await this.checkEnrollment(row);
      } catch (err) {
        this.logger.warn(
          `Evaluation monitor failed for ${row.id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
  }

  private async checkEnrollment(row: {
    id: string;
    userId: string;
    metaApiAccountId: string | null;
    startEquity: unknown;
    highWaterMark: unknown;
    dayStartEquity: unknown;
    dayStartedAt: Date | null;
    maxLossPercent: unknown;
    dailyLossPercent: unknown;
  }) {
    const accountId = row.metaApiAccountId?.trim();
    if (!accountId) return;

    const account = await this.metaApi.getAccount(accountId);
    const info = await this.metaApi.getAccountInformation(account);
    const equity = info.equity;
    const startEquity = Number(row.startEquity ?? equity);
    const maxLossPct = Number(row.maxLossPercent);
    const dailyLossPct = Number(row.dailyLossPercent);

    const now = new Date();
    let dayStartEquity = Number(row.dayStartEquity ?? equity);
    let dayStartedAt = row.dayStartedAt ?? now;

    const dayKey = (d: Date) =>
      `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (dayKey(dayStartedAt) !== dayKey(now)) {
      dayStartEquity = equity;
      dayStartedAt = now;
    }

    await this.prisma.evaluationEnrollment.update({
      where: { id: row.id },
      data: {
        currentEquity: equity,
        highWaterMark: Math.max(
          Number(row.highWaterMark ?? row.startEquity ?? equity),
          equity,
        ),
        dayStartEquity,
        dayStartedAt,
      },
    });

    const maxLossFloor = startEquity * (1 - maxLossPct / 100);
    if (equity <= maxLossFloor) {
      await this.evaluations.markBreached(
        row.id,
        `Max loss limit (${maxLossPct}%) reached`,
        equity,
      );
      return;
    }

    const dailyLossFloor = dayStartEquity * (1 - dailyLossPct / 100);
    if (equity <= dailyLossFloor) {
      await this.evaluations.markBreached(
        row.id,
        `Daily loss limit (${dailyLossPct}%) reached`,
        equity,
      );
    }
  }
}
