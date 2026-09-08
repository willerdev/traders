import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  formatKampalaTime,
  kampalaCalendarDate,
  kampalaMinutesSinceMidnight,
  pickRandomInvestorYieldDeliveryMinute,
} from '../common/kampala-time.util';
import { isKampalaWeekend } from '../common/kampala-weekend.util';

@Injectable()
export class InvestorYieldScheduleService {
  private readonly logger = new Logger(InvestorYieldScheduleService.name);

  constructor(private prisma: PrismaService) {}

  /** Ensure today's Kampala weekday has a random delivery minute stored in PlatformConfig. */
  async ensureTodaySchedule(): Promise<number | null> {
    if (isKampalaWeekend()) return null;

    const today = kampalaCalendarDate();
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
      select: {
        investorYieldScheduleDate: true,
        investorYieldScheduleMinute: true,
      },
    });

    if (
      config?.investorYieldScheduleDate &&
      config.investorYieldScheduleDate.getTime() === today.getTime() &&
      config.investorYieldScheduleMinute != null
    ) {
      return config.investorYieldScheduleMinute;
    }

    const scheduleMinute = pickRandomInvestorYieldDeliveryMinute();
    const updated = await this.prisma.platformConfig.updateMany({
      where: {
        id: 'default',
        NOT: { investorYieldScheduleDate: today },
      },
      data: {
        investorYieldScheduleDate: today,
        investorYieldScheduleMinute: scheduleMinute,
        investorYieldDeliveredDate: null,
      },
    });

    if (updated.count === 0) {
      const fresh = await this.prisma.platformConfig.findUnique({
        where: { id: 'default' },
        select: { investorYieldScheduleMinute: true },
      });
      return fresh?.investorYieldScheduleMinute ?? scheduleMinute;
    }

    const hour = Math.floor(scheduleMinute / 60);
    const minute = scheduleMinute % 60;
    this.logger.log(
      `Smart Invest yield scheduled for ${formatKampalaTime(hour, minute)} Kampala today`,
    );
    return scheduleMinute;
  }

  /** True when current Kampala time has reached today's scheduled delivery minute. */
  async isYieldDeliveryDue(now = new Date()): Promise<boolean> {
    if (isKampalaWeekend(now)) return false;

    const today = kampalaCalendarDate(now);
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
      select: {
        investorYieldScheduleDate: true,
        investorYieldScheduleMinute: true,
        investorYieldDeliveredDate: true,
      },
    });

    if (
      config?.investorYieldDeliveredDate &&
      config.investorYieldDeliveredDate.getTime() === today.getTime()
    ) {
      return false;
    }

    const scheduleMinute =
      config?.investorYieldScheduleDate?.getTime() === today.getTime() &&
      config.investorYieldScheduleMinute != null
        ? config.investorYieldScheduleMinute
        : await this.ensureTodaySchedule();

    if (scheduleMinute == null) return false;
    return kampalaMinutesSinceMidnight(now) >= scheduleMinute;
  }

  /** Mark today's Kampala yield delivery complete (idempotent across instances). */
  async markYieldDelivered(now = new Date()): Promise<boolean> {
    const today = kampalaCalendarDate(now);
    const updated = await this.prisma.platformConfig.updateMany({
      where: {
        id: 'default',
        NOT: { investorYieldDeliveredDate: today },
      },
      data: { investorYieldDeliveredDate: today },
    });
    return updated.count > 0;
  }

  /** Claim today's daily report send slot (21:00 job). */
  async claimDailyReportSend(now = new Date()): Promise<boolean> {
    const today = kampalaCalendarDate(now);
    const updated = await this.prisma.platformConfig.updateMany({
      where: {
        id: 'default',
        NOT: { investorDailyReportSentDate: today },
      },
      data: { investorDailyReportSentDate: today },
    });
    return updated.count > 0;
  }
}
