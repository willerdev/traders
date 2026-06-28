import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const ESCALATION_PATTERNS = [
  /\b(speak|talk|chat)\s+(to|with)\s+(a\s+)?(human|person|admin|agent|support\s+team|real\s+person)\b/i,
  /\b(connect|transfer|escalate)\s+(me\s+)?(to\s+)?(admin|human|support)\b/i,
  /\b(request|need|want)\s+(a\s+)?(human|admin|real\s+person)\b/i,
  /\bhuman\s+support\b/i,
  /\bspeak\s+to\s+admin\b/i,
  /\btalk\s+to\s+admin\b/i,
];

@Injectable()
export class SupportAgentService {
  private readonly logger = new Logger(SupportAgentService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly knowledge: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('DEEPSEEK_API_KEY') || '';
    this.model = this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    this.baseUrl =
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1';

    const candidates = [
      join(process.cwd(), 'dist', 'src', 'ai', 'knowledge', 'platform-knowledge.md'),
      join(process.cwd(), 'src', 'ai', 'knowledge', 'platform-knowledge.md'),
    ];
    let loaded = '';
    for (const knowledgePath of candidates) {
      try {
        loaded = readFileSync(knowledgePath, 'utf8');
        break;
      } catch {
        /* try next */
      }
    }
    this.knowledge = loaded ||
        'TraderRank Pro is a trader talent-discovery platform. Traders submit setups, compete on a leaderboard, and can earn payouts. Direct account-specific questions to a human admin.';
    if (!loaded) {
      this.logger.warn('Platform knowledge file not found — using fallback');
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  wantsHumanSupport(message: string): boolean {
    const text = message.trim();
    return ESCALATION_PATTERNS.some((re) => re.test(text));
  }

  async generateReply(
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    if (!this.isConfigured) {
      return this.fallbackReply(userMessage);
    }

    const systemPrompt = `You are Agent, the TraderRank Pro support assistant.

${this.knowledge}

Instructions:
- Answer using only the knowledge above. If unsure, say so and suggest speaking to a human admin.
- Keep replies concise (under 120 words unless listing steps).
- Use plain text, no markdown headers. Bullet lists are OK for steps.
- Never reveal API keys, passwords, or other users' information.
- If the user asks to speak to a human/admin, acknowledge and tell them to use the "Speak to admin" button or say "speak to admin".`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.slice(-12),
      { role: 'user' as const, content: userMessage },
    ];

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.4,
          max_tokens: 500,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        this.logger.warn(`DeepSeek support reply failed: ${err.slice(0, 200)}`);
        return this.fallbackReply(userMessage);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return this.fallbackReply(userMessage);
      return content;
    } catch (err) {
      this.logger.error(
        `Support agent error: ${err instanceof Error ? err.message : err}`,
      );
      return this.fallbackReply(userMessage);
    }
  }

  private fallbackReply(userMessage: string): string {
    const lower = userMessage.toLowerCase();
    if (lower.includes('kyc')) {
      return 'KYC is submitted in Settings under the verification section. Upload your ID and a selfie. Approval is required before payouts. Check your KYC status on the Settings or Payouts page.';
    }
    if (lower.includes('payout') || lower.includes('withdraw')) {
      return 'Payouts are requested from the Payouts page after KYC is approved. You receive 40% of virtual profit to your USDT wallet. Admin reviews each request.';
    }
    if (lower.includes('tp') || lower.includes('claim')) {
      return 'To claim take profit, go to Dashboard → Unresolved Setups, upload before and after screenshots, and wait for admin review on the TP Claims page. Rejected claims can be resubmitted.';
    }
    if (lower.includes('payment') || lower.includes('register')) {
      return 'Complete registration payment in USDT via the payment flow after sign-up. Once confirmed (or approved by admin), your account becomes active and you can submit setups.';
    }
    return 'Thanks for reaching out! I can help with setups, KYC, payouts, TP claims, and how the platform works. For account-specific issues, tap "Speak to admin" and a team member will reply within 24 hours.';
  }
}
