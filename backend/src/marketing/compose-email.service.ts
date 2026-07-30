import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { isRegistrationEmailAllowed } from '../common/email-quality.util';

const SEND_DELAY_MS = 450;
const MAX_SENDS = 2500;

export type ComposeAudience =
  | 'selected'
  | 'all'
  | 'active'
  | 'investors';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToEmailHtml(body: string): string {
  const blocks = body
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!blocks.length) return '<p></p>';
  return blocks
    .map(
      (block) =>
        `<p style="margin:0 0 14px;">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');
}

@Injectable()
export class ComposeEmailService {
  private readonly logger = new Logger(ComposeEmailService.name);
  private sending = false;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  private deepseekKey(): string {
    return (this.config.get<string>('DEEPSEEK_API_KEY') || '').trim();
  }

  private baseRecipientWhere(): Prisma.UserWhereInput {
    return {
      role: { not: 'ADMIN' },
      status: { notIn: ['BANNED'] },
      email: { not: null },
    };
  }

  private async countAudience(where: Prisma.UserWhereInput) {
    return this.prisma.user.count({ where });
  }

  async status() {
    const base = this.baseRecipientWhere();
    const [activeCount, investorCount] = await Promise.all([
      this.countAudience({
        ...base,
        status: 'ACTIVE',
      }),
      this.countAudience({
        ...base,
        investorActive: true,
      }),
    ]);

    return {
      emailConfigured: this.email.isConfigured,
      emailFrom: this.email.from,
      aiConfigured: this.deepseekKey().length > 0,
      aiProvider: 'deepseek',
      audiences: {
        active: {
          count: activeCount,
          label: 'Active accounts',
          description: 'Users with ACTIVE status (paid / verified accounts)',
        },
        investors: {
          count: investorCount,
          label: 'Investors',
          description: 'Users with Smart Invest enrollment (investorActive)',
        },
      },
    };
  }

  /**
   * AI polishes the admin draft into clearer, professional Tradeguard email copy.
   * Keeps the same meaning; does not invent product claims.
   */
  async polish(input: { subject?: string; body: string }) {
    const draft = (input.body || '').trim();
    if (draft.length < 8) {
      throw new BadRequestException('Write a bit more text before polishing.');
    }
    const key = this.deepseekKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'DEEPSEEK_API_KEY is not configured on this API.',
      );
    }

    const model =
      this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    const baseUrl =
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1';

    const subjectHint = (input.subject || '').trim();

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: `You rewrite admin emails for Tradeguard (investment / yield platform).
Return ONLY valid JSON (no markdown): {"subject":"...","body":"..."}.
Rules:
- Keep the admin's intent and facts. Do not invent yields, fees, dates, or promises.
- Make tone clear, professional, warm, concise.
- body is plain text with short paragraphs separated by blank lines. No HTML.
- subject is one line, under 90 characters.
- Do not add unsubscribe legalese.
- Sign-off may be "— Tradeguard team" if none is present.`,
          },
          {
            role: 'user',
            content: `Subject draft: ${subjectHint || '(none — invent a fitting subject)'}
Body draft:
${draft}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      this.logger.error(
        `DeepSeek polish failed: ${response.status} ${errText.slice(0, 200)}`,
      );
      throw new ServiceUnavailableException(
        'AI polish failed — try again shortly.',
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let raw = data.choices?.[0]?.message?.content?.trim() || '{}';
    raw = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    let parsed: { subject?: string; body?: string };
    try {
      parsed = JSON.parse(raw) as { subject?: string; body?: string };
    } catch {
      throw new ServiceUnavailableException('AI returned unreadable copy.');
    }

    const subject = (
      parsed.subject ||
      subjectHint ||
      'Message from Tradeguard'
    ).trim();
    const body = (parsed.body || draft).trim();
    if (!body) {
      throw new BadRequestException('AI returned an empty body.');
    }

    return { subject, body };
  }

  private resolveAudience(input: {
    audience?: string;
    allUsers?: boolean;
  }): ComposeAudience {
    const raw = String(input.audience ?? '')
      .trim()
      .toLowerCase();
    if (
      raw === 'active' ||
      raw === 'investors' ||
      raw === 'all' ||
      raw === 'selected'
    ) {
      return raw;
    }
    if (input.allUsers) return 'all';
    return 'selected';
  }

  private audienceWhere(audience: ComposeAudience): Prisma.UserWhereInput {
    const base = this.baseRecipientWhere();
    if (audience === 'active') {
      return { ...base, status: 'ACTIVE' };
    }
    if (audience === 'investors') {
      return {
        ...base,
        investorActive: true,
      };
    }
    return base;
  }

  async send(input: {
    subject: string;
    body: string;
    userIds?: string[];
    allUsers?: boolean;
    audience?: string;
    confirmAll?: boolean;
  }) {
    if (this.sending) {
      throw new BadRequestException('Another compose send is already running.');
    }
    if (!this.email.isConfigured) {
      throw new ServiceUnavailableException('Email is not configured (RESEND_API_KEY).');
    }

    const subject = (input.subject || '').trim();
    const body = (input.body || '').trim();
    if (!subject) throw new BadRequestException('Subject is required.');
    if (body.length < 8) throw new BadRequestException('Body is too short.');

    const audience = this.resolveAudience(input);
    const bulk =
      audience === 'all' || audience === 'active' || audience === 'investors';
    if (bulk && !input.confirmAll) {
      throw new BadRequestException(
        'Bulk audience sends require confirmAll: true.',
      );
    }

    const userIds = [...new Set((input.userIds || []).filter(Boolean))];
    if (audience === 'selected' && userIds.length === 0) {
      throw new BadRequestException(
        'Select at least one user, or choose Active / Investors.',
      );
    }

    this.sending = true;
    try {
      const recipients =
        audience === 'selected'
          ? await this.prisma.user.findMany({
              where: {
                id: { in: userIds },
                email: { not: null },
                status: { notIn: ['BANNED'] },
              },
              select: { id: true, email: true, displayName: true },
            })
          : await this.prisma.user.findMany({
              where: this.audienceWhere(audience),
              select: { id: true, email: true, displayName: true },
              take: MAX_SENDS,
            });

      const audienceKey = `admin_compose:${audience}`;

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const u of recipients) {
        const to = u.email?.trim().toLowerCase();
        if (!to || !isRegistrationEmailAllowed(to)) {
          skipped += 1;
          continue;
        }

        const name = u.displayName?.trim() || 'there';
        const personalizedBody = body.replace(/\{\{name\}\}/gi, name);
        const html = this.email.layout(subject, textToEmailHtml(personalizedBody));

        const ok = await this.email.send({
          to,
          subject,
          html,
          text: personalizedBody,
        });

        await this.prisma.marketingEmail.create({
          data: {
            userId: u.id,
            email: to,
            audience: audienceKey,
            subject,
            status: ok ? 'SENT' : 'FAILED',
            detail: `compose:${audience}`,
          },
        });

        if (ok) sent += 1;
        else failed += 1;
        await sleep(SEND_DELAY_MS);
      }

      this.logger.log(
        `Compose email (${audienceKey}): sent=${sent} failed=${failed} skipped=${skipped}`,
      );

      return {
        ok: true,
        audience: audienceKey,
        targeted: recipients.length,
        sent,
        failed,
        skipped,
        subject,
      };
    } finally {
      this.sending = false;
    }
  }
}
