import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { isRegistrationEmailAllowed } from '../common/email-quality.util';

const SEND_DELAY_MS = 450;
const MAX_SENDS = 2500;

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

  private openAiKey(): string {
    return (this.config.get<string>('OPENAI_API_KEY') || '').trim();
  }

  status() {
    return {
      emailConfigured: this.email.isConfigured,
      emailFrom: this.email.from,
      aiConfigured: this.openAiKey().length > 0,
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
    const key = this.openAiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is not configured on this API.',
      );
    }

    const model =
      this.config.get<string>('OPENAI_COMPOSE_MODEL') ||
      this.config.get<string>('OPENAI_VISION_MODEL') ||
      'gpt-4o-mini';
    const baseUrl =
      this.config.get<string>('OPENAI_API_URL') || 'https://api.openai.com/v1';

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
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You rewrite admin emails for Tradeguard (investment / yield platform).
Return ONLY JSON: {"subject":"...","body":"..."}.
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
      this.logger.error(`OpenAI polish failed: ${response.status} ${errText.slice(0, 200)}`);
      throw new ServiceUnavailableException('AI polish failed — try again shortly.');
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}';
    let parsed: { subject?: string; body?: string };
    try {
      parsed = JSON.parse(raw) as { subject?: string; body?: string };
    } catch {
      throw new ServiceUnavailableException('AI returned unreadable copy.');
    }

    const subject = (parsed.subject || subjectHint || 'Message from Tradeguard').trim();
    const body = (parsed.body || draft).trim();
    if (!body) {
      throw new BadRequestException('AI returned an empty body.');
    }

    return { subject, body };
  }

  async send(input: {
    subject: string;
    body: string;
    userIds?: string[];
    allUsers?: boolean;
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

    const allUsers = Boolean(input.allUsers);
    if (allUsers && !input.confirmAll) {
      throw new BadRequestException(
        'Sending to all users requires confirmAll: true.',
      );
    }

    const userIds = [...new Set((input.userIds || []).filter(Boolean))];
    if (!allUsers && userIds.length === 0) {
      throw new BadRequestException('Select at least one user, or choose all users.');
    }

    this.sending = true;
    try {
      const recipients = allUsers
        ? await this.prisma.user.findMany({
            where: {
              role: { not: 'ADMIN' },
              status: { notIn: ['BANNED'] },
              email: { not: null },
            },
            select: { id: true, email: true, displayName: true },
            take: MAX_SENDS,
          })
        : await this.prisma.user.findMany({
            where: {
              id: { in: userIds },
              email: { not: null },
            },
            select: { id: true, email: true, displayName: true },
          });

      const audience = allUsers ? 'admin_compose:all' : 'admin_compose:selected';

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
            audience,
            subject,
            status: ok ? 'SENT' : 'FAILED',
            detail: allUsers ? 'compose:all' : 'compose:selected',
          },
        });

        if (ok) sent += 1;
        else failed += 1;
        await sleep(SEND_DELAY_MS);
      }

      this.logger.log(
        `Compose email (${audience}): sent=${sent} failed=${failed} skipped=${skipped}`,
      );

      return {
        ok: true,
        audience,
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
