import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycDocumentType } from '@prisma/client';

export type DocumentNumberValidation = {
  ok: boolean;
  plausible: boolean;
  confidence: number;
  reason: string;
  suggestedFormatHint?: string;
};

@Injectable()
export class KycAiService {
  private readonly logger = new Logger(KycAiService.name);

  constructor(private readonly config: ConfigService) {}

  private deepseekKey(): string {
    return (this.config.get<string>('DEEPSEEK_API_KEY') || '').trim();
  }

  configured() {
    return {
      deepseekConfigured: this.deepseekKey().length > 0,
      /** Official DeepSeek chat API is text-only — not for camera liveness. */
      deepseekSupportsVision: false,
      recommendedLivenessProvider: 'aws_rekognition_face_liveness',
      note:
        'Use DeepSeek for typed ID-number plausibility. Use Amazon Rekognition Face Liveness (or FaceTec) for real anti-spoof liveness.',
    };
  }

  /**
   * Ask DeepSeek whether a typed document number looks real vs random/garbage.
   * Does not prove government authenticity — only format / entropy plausibility.
   */
  async validateDocumentNumber(input: {
    documentType: KycDocumentType;
    documentNumber: string;
    country?: string;
  }): Promise<DocumentNumberValidation> {
    const number = (input.documentNumber || '').trim();
    if (number.length < 4) {
      throw new BadRequestException('Document number is too short');
    }

    // Fast local heuristics first (always available).
    const heuristic = this.heuristicCheck(
      input.documentType,
      number,
      input.country,
    );
    if (!heuristic.plausible && heuristic.confidence >= 0.85) {
      return heuristic;
    }

    const key = this.deepseekKey();
    if (!key) {
      // Soft-fail open when AI not configured: use heuristics only.
      this.logger.warn('DEEPSEEK_API_KEY missing — using heuristic ID check only');
      return heuristic;
    }

    const model =
      this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    const baseUrl =
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1';

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: `You validate whether a typed identity document number looks plausible (not necessarily government-verified).
Return ONLY JSON:
{"plausible":boolean,"confidence":0-1,"reason":"short","suggestedFormatHint":"optional"}
Rules:
- Reject obvious keyboard mashing, repeated chars (111111), sequential (123456), all zeros, "test", "asdf", "xxxxxx".
- Accept numbers that match common formats for the document type and country when known.
- Do not invent that a number is government-issued — only that it looks like a real ID number pattern.
- Be strict on random garbage; be lenient on uncommon but structured alphanumerics.`,
            },
            {
              role: 'user',
              content: JSON.stringify({
                country: input.country || null,
                documentType: input.documentType,
                documentNumber: number,
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(`DeepSeek ID check failed: ${response.status} ${text}`);
        return heuristic;
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = json.choices?.[0]?.message?.content?.trim() || '';
      const parsed = this.parseJson(raw);
      if (!parsed) return heuristic;

      const plausible = Boolean(parsed.plausible);
      const confidence = Math.min(
        1,
        Math.max(0, Number(parsed.confidence) || 0.5),
      );
      return {
        ok: plausible,
        plausible,
        confidence,
        reason: String(parsed.reason || '').slice(0, 240) || heuristic.reason,
        suggestedFormatHint: parsed.suggestedFormatHint
          ? String(parsed.suggestedFormatHint).slice(0, 160)
          : heuristic.suggestedFormatHint,
      };
    } catch (err) {
      this.logger.warn(
        `DeepSeek ID check error: ${err instanceof Error ? err.message : err}`,
      );
      return heuristic;
    }
  }

  private heuristicCheck(
    documentType: KycDocumentType,
    number: string,
    country?: string,
  ): DocumentNumberValidation {
    const cleaned = number.replace(/\s+/g, '');
    const lower = cleaned.toLowerCase();
    const digits = cleaned.replace(/\D/g, '');

    if (
      /^(.)\1{4,}$/.test(cleaned) ||
      /^(012345|123456|234567|345678|456789|987654|abcdef|asdf|qwerty|test|xxx+)/i.test(
        lower,
      ) ||
      /^0+$/.test(digits)
    ) {
      return {
        ok: false,
        plausible: false,
        confidence: 0.95,
        reason: 'Looks like a placeholder or repeated/sequential pattern',
        suggestedFormatHint: 'Enter the exact number printed on your document',
      };
    }

    if (cleaned.length < 5 || cleaned.length > 24) {
      return {
        ok: false,
        plausible: false,
        confidence: 0.8,
        reason: 'Length is unusual for an ID / passport number',
        suggestedFormatHint:
          documentType === 'PASSPORT'
            ? 'Passports are usually 6–9 alphanumeric characters'
            : 'National IDs are usually 6–16 digits or alphanumerics',
      };
    }

    // Very low entropy (few unique chars)
    const unique = new Set(cleaned.toLowerCase().split('')).size;
    if (unique <= 2 && cleaned.length >= 6) {
      return {
        ok: false,
        plausible: false,
        confidence: 0.9,
        reason: 'Too little variation — likely not a real document number',
      };
    }

    const countryKey = (country || '').trim().toUpperCase();
    if (
      (countryKey === 'RW' || countryKey === 'RWANDA') &&
      documentType === 'NATIONAL_ID' &&
      !/^\d{16}$/.test(digits)
    ) {
      return {
        ok: false,
        plausible: false,
        confidence: 0.7,
        reason: 'Rwandan national IDs are typically 16 digits',
        suggestedFormatHint: '16 digits as printed on the card',
      };
    }

    return {
      ok: true,
      plausible: true,
      confidence: 0.55,
      reason: 'Passes basic format checks',
    };
  }

  private parseJson(raw: string): {
    plausible?: boolean;
    confidence?: number;
    reason?: string;
    suggestedFormatHint?: string;
  } | null {
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start < 0 || end <= start) return null;
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
