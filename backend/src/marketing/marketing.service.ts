import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { isRegistrationEmailAllowed } from '../common/email-quality.util';

export type MarketingAudience = 'unpaid_registration' | 'inactive_trader';

const INACTIVE_AFTER_DAYS = 14;
const DEDUPE_HOURS = 48;
const MAX_SENDS_PER_RUN = 500;
const SEND_DELAY_MS = 600;

/** Campaign runs Monday and Thursday at 10:00 UTC — two emails per week. */
export const CAMPAIGN_CRON_DAYS = [1, 4]; // Mon, Thu
export const CAMPAIGN_CRON_HOUR_UTC = 10;

type Recipient = {
  userId: string;
  email: string;
  displayName: string;
  status: string;
  createdAt: Date;
  lastSignalAt: Date | null;
  lastMarketingAt: Date | null;
};

type RunSummary = {
  trigger: 'cron' | 'manual';
  startedAt: string;
  emailConfigured: boolean;
  audiences: Record<MarketingAudience, { targeted: number; sent: number; skipped: number; failed: number }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  /** Monday 10:00 UTC */
  @Cron(`0 ${CAMPAIGN_CRON_HOUR_UTC} * * 1`)
  async mondayCampaignJob() {
    await this.runCampaign('cron');
  }

  /** Thursday 10:00 UTC */
  @Cron(`0 ${CAMPAIGN_CRON_HOUR_UTC} * * 4`)
  async thursdayCampaignJob() {
    await this.runCampaign('cron');
  }

  nextRuns(count = 4): { runsAt: string; label: string }[] {
    const runs: { runsAt: string; label: string }[] = [];
    const now = new Date();
    const d = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        CAMPAIGN_CRON_HOUR_UTC,
        0,
        0,
      ),
    );
    while (runs.length < count) {
      if (CAMPAIGN_CRON_DAYS.includes(d.getUTCDay()) && d > now) {
        runs.push({
          runsAt: d.toISOString(),
          label: d.getUTCDay() === 1 ? 'Monday reminder' : 'Thursday reminder',
        });
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return runs;
  }

  /** Users who registered but never paid the registration fee. */
  private async unpaidRecipients(): Promise<Recipient[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: 'TRADER',
        registrationPaid: false,
        status: { notIn: ['BANNED', 'SUSPENDED'] },
        email: { not: null },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
        signals: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
          select: { submittedAt: true },
        },
        marketingEmails: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { sentAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users
      .filter((u) => isRegistrationEmailAllowed(u.email as string))
      .map((u) => ({
        userId: u.id,
        email: (u.email as string).toLowerCase(),
        displayName: u.displayName,
        status: u.status,
        createdAt: u.createdAt,
        lastSignalAt: u.signals[0]?.submittedAt ?? null,
        lastMarketingAt: u.marketingEmails[0]?.sentAt ?? null,
      }));
  }

  /** Paid, active traders who have not submitted a setup recently (or ever). */
  private async inactiveRecipients(): Promise<Recipient[]> {
    const cutoff = new Date(Date.now() - INACTIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const users = await this.prisma.user.findMany({
      where: {
        role: 'TRADER',
        registrationPaid: true,
        status: 'ACTIVE',
        email: { not: null },
        signals: { none: { submittedAt: { gte: cutoff } } },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
        signals: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
          select: { submittedAt: true },
        },
        marketingEmails: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { sentAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users
      .filter((u) => isRegistrationEmailAllowed(u.email as string))
      .map((u) => ({
        userId: u.id,
        email: (u.email as string).toLowerCase(),
        displayName: u.displayName,
        status: u.status,
        createdAt: u.createdAt,
        lastSignalAt: u.signals[0]?.submittedAt ?? null,
        lastMarketingAt: u.marketingEmails[0]?.sentAt ?? null,
      }));
  }

  async getSchedule() {
    const [unpaid, inactive] = await Promise.all([
      this.unpaidRecipients(),
      this.inactiveRecipients(),
    ]);

    return {
      emailConfigured: this.email.isConfigured,
      cadence: 'Twice weekly — Monday and Thursday at 10:00 UTC',
      inactiveAfterDays: INACTIVE_AFTER_DAYS,
      nextRuns: this.nextRuns(4),
      audiences: {
        unpaid_registration: {
          description: 'Registered but registration fee not paid',
          count: unpaid.length,
          recipients: unpaid,
        },
        inactive_trader: {
          description: `Paid traders with no setup in the last ${INACTIVE_AFTER_DAYS} days`,
          count: inactive.length,
          recipients: inactive,
        },
      },
    };
  }

  async getHistory(limit = 100, offset = 0) {
    const [items, count] = await Promise.all([
      this.prisma.marketingEmail.findMany({
        orderBy: { sentAt: 'desc' },
        take: Math.min(limit, 200),
        skip: offset,
        include: {
          user: { select: { id: true, displayName: true, status: true } },
        },
      }),
      this.prisma.marketingEmail.count(),
    ]);
    return { items, count };
  }

  async sendTestEmail(to: string) {
    const email = to.trim().toLowerCase();
    if (!email.includes('@')) {
      throw new BadRequestException('Invalid email address');
    }

    const html = this.email.layout(
      'Email test — TraderRank Pro',
      `<p>This is a test email from the TraderRank Pro marketing system.</p>
      <p>If you received this, Resend is configured correctly and campaigns can be sent.</p>
      <p style="color:#94a3b8;font-size:13px;">Sent at ${new Date().toISOString()}</p>`,
    );

    const ok = await this.email.send({
      to: email,
      subject: 'TraderRank Pro — email test',
      html,
      text: 'TraderRank Pro email test — if you received this, Resend is working.',
    });

    if (!ok) {
      throw new BadRequestException(
        'Email could not be sent — check RESEND_API_KEY and EMAIL_FROM on the API server',
      );
    }

    return { ok: true, to: email, message: `Test email sent to ${email}` };
  }

  async runCampaign(trigger: 'cron' | 'manual'): Promise<RunSummary> {
    const summary: RunSummary = {
      trigger,
      startedAt: new Date().toISOString(),
      emailConfigured: this.email.isConfigured,
      audiences: {
        unpaid_registration: { targeted: 0, sent: 0, skipped: 0, failed: 0 },
        inactive_trader: { targeted: 0, sent: 0, skipped: 0, failed: 0 },
      },
    };

    if (this.running) {
      this.logger.warn('Marketing campaign already running — skipped');
      return summary;
    }
    if (!this.email.isConfigured) {
      this.logger.warn('RESEND_API_KEY not set — marketing campaign skipped');
      return summary;
    }

    this.running = true;
    try {
      const dedupeCutoff = new Date(Date.now() - DEDUPE_HOURS * 60 * 60 * 1000);
      const [unpaid, inactive] = await Promise.all([
        this.unpaidRecipients(),
        this.inactiveRecipients(),
      ]);

      const batches: Array<{ audience: MarketingAudience; recipients: Recipient[] }> = [
        { audience: 'unpaid_registration', recipients: unpaid },
        { audience: 'inactive_trader', recipients: inactive },
      ];

      let sends = 0;
      for (const { audience, recipients } of batches) {
        summary.audiences[audience].targeted = recipients.length;

        for (const recipient of recipients) {
          if (sends >= MAX_SENDS_PER_RUN) {
            this.logger.warn(`Send cap ${MAX_SENDS_PER_RUN} reached — stopping run`);
            break;
          }

          if (recipient.lastMarketingAt && recipient.lastMarketingAt > dedupeCutoff) {
            summary.audiences[audience].skipped += 1;
            continue;
          }

          const { subject, html, text } = this.buildEmail(audience, recipient);
          const ok = await this.email.send({ to: recipient.email, subject, html, text });
          sends += 1;

          await this.prisma.marketingEmail.create({
            data: {
              userId: recipient.userId,
              email: recipient.email,
              audience,
              subject,
              status: ok ? 'SENT' : 'FAILED',
              detail: trigger,
            },
          });

          if (ok) summary.audiences[audience].sent += 1;
          else summary.audiences[audience].failed += 1;

          await sleep(SEND_DELAY_MS);
        }
      }

      this.logger.log(
        `Marketing run (${trigger}): unpaid ${summary.audiences.unpaid_registration.sent}/${summary.audiences.unpaid_registration.targeted} sent, ` +
          `inactive ${summary.audiences.inactive_trader.sent}/${summary.audiences.inactive_trader.targeted} sent`,
      );
      return summary;
    } finally {
      this.running = false;
    }
  }

  private buildEmail(
    audience: MarketingAudience,
    recipient: Recipient,
  ): { subject: string; html: string; text: string } {
    const name = recipient.displayName?.trim() || 'Trader';
    const url = this.email.frontendUrl;
    // Alternate copy between the two weekly sends so reminders don't repeat verbatim.
    const variant = new Date().getUTCDay() === CAMPAIGN_CRON_DAYS[0] ? 0 : 1;

    if (audience === 'unpaid_registration') {
      const subjects = [
        'Your $1,000 funded account is waiting — activate it today',
        `${name}, one step left: activate your TraderRank account`,
      ];
      const subject = subjects[variant];
      const html = this.email.layout(
        'Activate your funded account',
        `<p>Hi ${name},</p>
        <p>You registered on <strong>TraderRank Pro</strong> but haven't activated your account yet.
        Complete the one-time registration and you'll get a <strong>$1,000 virtual funded account</strong>
        — submit trading setups, climb the leaderboard, and <strong>get paid for what you do best</strong>.</p>
        <ul style="color:#cbd5e1;">
          <li>Submit setups — our system executes them on MT5</li>
          <li>Earn TP rewards credited straight to your wallet</li>
          <li>Weekly profit share: 40% of your virtual profits</li>
        </ul>
        ${this.email.button(`${url}/dashboard`, 'Activate my account')}
        <p style="color:#94a3b8;font-size:13px;margin-top:24px;">No KYC needed to start trading — verification is only required when you request a payout.</p>`,
      );
      const text = `Hi ${name}, activate your TraderRank Pro account to get your $1,000 virtual funded account and start getting paid for your trading. Activate: ${url}/dashboard`;
      return { subject, html, text };
    }

    const subjects = [
      'Your funded account misses you — submit a setup this week',
      `${name}, the leaderboard is moving without you`,
    ];
    const subject = subjects[variant];
    const html = this.email.layout(
      'Get back in the game',
      `<p>Hi ${name},</p>
      <p>Your <strong>$1,000 funded account</strong> is active, but you haven't submitted a setup
      ${recipient.lastSignalAt ? 'recently' : 'yet'}. Every week you sit out is a week of missed
      TP rewards and profit share — <strong>get paid for what you do best</strong>.</p>
      <ul style="color:#cbd5e1;">
        <li>Upload a chart — AI fills in your setup automatically</li>
        <li>TP hits credit rewards straight to your wallet</li>
        <li>Weekly payouts: 40% of your virtual profits</li>
      </ul>
      ${this.email.button(`${url}/submit`, 'Submit a setup now')}`,
    );
    const text = `Hi ${name}, your funded account is active but idle. Submit a setup and start earning TP rewards and weekly profit share: ${url}/submit`;
    return { subject, html, text };
  }
}
