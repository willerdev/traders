import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TradeDirection } from '@prisma/client';
import { CreateSignalDto } from '../common/dto';
import { normalizeChartSymbol } from './chart-setup.util';

export interface SignalValidationResult {
  approved: boolean;
  adjusted: boolean;
  dto: CreateSignalDto;
  issues: string[];
  rejectReason?: string;
  confidence?: number;
}

const VALIDATION_PROMPT = (signal: CreateSignalDto) => `You are a strict trading signal QA reviewer. Validate this signal before it is sent to a live MT5 broker. Fix obvious errors (typos, wrong decimal place, inverted SL/TP, invalid symbol).

Signal to review:
${JSON.stringify(
  {
    symbol: signal.symbol,
    direction: signal.direction,
    entryMin: signal.entryMin,
    entryMax: signal.entryMax,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    riskRewardRatio: signal.riskRewardRatio,
    description: signal.description,
  },
  null,
  2,
)}

Return ONLY valid JSON (no markdown):
{
  "approved": true,
  "adjusted": false,
  "issues": ["list of problems found, empty if none"],
  "rejectReason": null,
  "confidence": 85,
  "symbol": "XAUUSD",
  "direction": "BUY",
  "entryMin": 2648.0,
  "entryMax": 2652.0,
  "stopLoss": 2640.0,
  "takeProfit": 2680.0
}

Rules:
- approved: false ONLY for unsafe/unfixable structural issues (SL/TP on wrong side, entryMin >= entryMax, nonsense prices like 0 or negative)
- Do NOT reject signals solely because the symbol is unfamiliar — brokers support many synthetic/CFD symbols
- adjusted: true if you changed any numeric field or symbol/direction
- For BUY: stopLoss < entryMin, takeProfit > entryMax
- For SELL: stopLoss > entryMax, takeProfit < entryMin
- entryMin must be < entryMax
- XAUUSD/gold prices are typically 1000–5000 (catch missing digits like 265.5 → 2655.0)
- FX majors (EURUSD etc.) typically 0.5–2.0
- US indices (NAS100, US30) typically 10000–50000
- Synthetic volatility indices (1HZ10V, 1HZ25V, 1HZ50V, 1HZ75V, 1HZ100V) often trade 50,000–900,000 — approve if SL/TP logic is correct
- TradingView/Deriv "Volatility 75 (1s) Index" or VIX75 1s → use MT5 symbol 1HZ75V (not VIX75)
- Normalize symbols to the broker ticker MT5 expects (e.g. 1HZ75V, XAUUSD)
- direction must be exactly "BUY" or "SELL"
- confidence: integer 0–100 reflecting how safe/consistent the signal is after review (90+ clean, 75–89 minor fixes, below 75 only if still structurally valid)
- If SL/TP logic is valid, approve even for uncommon symbols; only reject when structure is broken`;

@Injectable()
export class SignalValidationService {
  private readonly logger = new Logger(SignalValidationService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('DEEPSEEK_API_KEY') || '';
    this.model = this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    this.baseUrl =
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1';
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /** Map chart/TradingView names to MT5 broker symbols. */
  private normalizeSymbol(raw: string): string {
    return normalizeChartSymbol(raw);
  }

  private normalizeDto(dto: CreateSignalDto): CreateSignalDto {
    const symbol = this.normalizeSymbol(dto.symbol);
    if (symbol === dto.symbol) return dto;
    return { ...dto, symbol };
  }

  /** AI sometimes rejects valid CFD/synthetic symbols — override when structure is sound. */
  private isSymbolOnlyRejection(
    rejectReason?: string,
    issues: string[] = [],
  ): boolean {
    const text = [rejectReason, ...issues].join(' ').toLowerCase();
    const patterns = [
      'invalid symbol',
      'unknown instrument',
      'does not match',
      'unrecognized symbol',
      'nonsense symbol',
      'invalid and prices',
      'not a known',
      'unable to fix',
      'no known instrument',
      'unfamiliar symbol',
    ];
    return patterns.some((p) => text.includes(p));
  }

  private ruleCheck(dto: CreateSignalDto): string[] {
    const issues: string[] = [];

    const symbol = this.normalizeSymbol(dto.symbol);
    if (!symbol || symbol.length < 2) {
      issues.push('Invalid or missing symbol');
    }

    if (dto.entryMin >= dto.entryMax) {
      issues.push('Entry min must be less than entry max');
    }

    if (!Number.isFinite(dto.stopLoss) || !Number.isFinite(dto.takeProfit)) {
      issues.push('Stop loss and take profit must be valid numbers');
    }

    if (dto.direction === 'BUY') {
      if (dto.stopLoss >= dto.entryMin) {
        issues.push('BUY: stop loss must be below entry range');
      }
      if (dto.takeProfit <= dto.entryMax) {
        issues.push('BUY: take profit must be above entry range');
      }
    } else {
      if (dto.stopLoss <= dto.entryMax) {
        issues.push('SELL: stop loss must be above entry range');
      }
      if (dto.takeProfit >= dto.entryMin) {
        issues.push('SELL: take profit must be below entry range');
      }
    }

    return issues;
  }

  private mergeDto(
    original: CreateSignalDto,
    corrected: Record<string, unknown>,
  ): CreateSignalDto {
    const symbol = this.normalizeSymbol(
      String(corrected.symbol || original.symbol),
    );
    const direction = String(corrected.direction || original.direction).toUpperCase();
    const entryMin = Number(corrected.entryMin ?? original.entryMin);
    const entryMax = Number(corrected.entryMax ?? original.entryMax);
    const stopLoss = Number(corrected.stopLoss ?? original.stopLoss);
    const takeProfit = Number(corrected.takeProfit ?? original.takeProfit);

    const risk =
      Math.abs(
        (direction === 'BUY' ? takeProfit - entryMax : entryMin - takeProfit) /
          (direction === 'BUY' ? entryMin - stopLoss : stopLoss - entryMax),
      ) || original.riskRewardRatio;

    return {
      ...original,
      symbol,
      direction: direction as TradeDirection,
      entryMin,
      entryMax,
      stopLoss,
      takeProfit,
      riskRewardRatio: Number.isFinite(risk) ? Math.round(risk * 100) / 100 : original.riskRewardRatio,
    };
  }

  private parseAiResponse(
    raw: string,
    original: CreateSignalDto,
  ): SignalValidationResult {
    let parsed: Record<string, unknown>;
    try {
      const cleaned = raw
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '');
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      this.logger.warn('DeepSeek returned unparseable JSON — using rule check only');
      const issues = this.ruleCheck(original);
      return {
        approved: issues.length === 0,
        adjusted: false,
        dto: original,
        issues,
        rejectReason: issues.length ? issues.join('; ') : undefined,
      };
    }

    const approved = Boolean(parsed.approved);
    const adjusted = Boolean(parsed.adjusted);
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.map(String)
      : [];
    const rejectReason = parsed.rejectReason
      ? String(parsed.rejectReason)
      : undefined;
    const rawConfidence = parsed.confidence;
    const confidence =
      typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(100, Math.round(rawConfidence)))
        : undefined;

    if (!approved) {
      return {
        approved: false,
        adjusted: false,
        dto: original,
        issues,
        rejectReason: rejectReason || 'Signal rejected by AI validation',
        confidence,
      };
    }

    const dto = this.mergeDto(original, parsed);
    const postIssues = this.ruleCheck(dto);
    if (postIssues.length > 0) {
      return {
        approved: false,
        adjusted,
        dto,
        issues: [...issues, ...postIssues],
        rejectReason: 'Corrected signal still fails validation rules',
        confidence,
      };
    }

    const resolvedConfidence =
      confidence ??
      (adjusted ? 78 : issues.length === 0 ? 92 : 85);

    return { approved: true, adjusted, dto, issues, confidence: resolvedConfidence };
  }

  async validateAndCorrect(dto: CreateSignalDto): Promise<SignalValidationResult> {
    dto = this.normalizeDto(dto);
    const ruleIssues = this.ruleCheck(dto);
    if (ruleIssues.length > 0 && !this.isConfigured) {
      return {
        approved: false,
        adjusted: false,
        dto,
        issues: ruleIssues,
        rejectReason: ruleIssues.join('; '),
      };
    }

    if (!this.isConfigured) {
      this.logger.warn('DeepSeek not configured — forwarding with rule check only');
      return {
        approved: ruleIssues.length === 0,
        adjusted: false,
        dto,
        issues: ruleIssues,
        rejectReason: ruleIssues.length ? ruleIssues.join('; ') : undefined,
        confidence: ruleIssues.length === 0 ? 75 : undefined,
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You validate and correct trading signals for live MT5 execution. Output JSON only.',
            },
            { role: 'user', content: VALIDATION_PROMPT(dto) },
          ],
          max_tokens: 1024,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(`DeepSeek validation failed: ${errText.slice(0, 300)}`);
        if (ruleIssues.length === 0) {
          return { approved: true, adjusted: false, dto, issues: ['AI validation unavailable — passed rule check'] };
        }
        return {
          approved: false,
          adjusted: false,
          dto,
          issues: ruleIssues,
          rejectReason: ruleIssues.join('; '),
        };
      }

      const payload = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty DeepSeek response');
      }

      const result = this.parseAiResponse(content, dto);
      if (
        !result.approved &&
        ruleIssues.length === 0 &&
        this.isSymbolOnlyRejection(result.rejectReason, result.issues)
      ) {
        this.logger.log(
          `Approving ${dto.symbol} despite AI symbol caution — SL/TP structure is valid`,
        );
        return {
          approved: true,
          adjusted: dto.symbol !== result.dto.symbol,
          dto,
          issues: [
            ...result.issues,
            'Symbol accepted: valid setup structure (synthetic/CFD symbol)',
          ],
        };
      }

      if (result.adjusted) {
        this.logger.log(
          `DeepSeek adjusted signal ${dto.symbol}: ${result.issues.join(', ') || 'minor corrections'}`,
        );
      }
      if (!result.approved) {
        this.logger.warn(
          `DeepSeek rejected signal ${dto.symbol}: ${result.rejectReason}`,
        );
      }
      return result;
    } catch (err) {
      this.logger.error(`DeepSeek validation error: ${(err as Error).message}`);
      if (ruleIssues.length === 0) {
        return { approved: true, adjusted: false, dto, issues: ['AI validation error — passed rule check'] };
      }
      return {
        approved: false,
        adjusted: false,
        dto,
        issues: ruleIssues,
        rejectReason: ruleIssues.join('; '),
      };
    }
  }
}
