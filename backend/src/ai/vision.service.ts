import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  normalizeChartSetup,
  normalizeChartSymbol,
  parseChartPrice,
  validateChartSetup,
} from './chart-setup.util';

export interface ChartAnalysisResult {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  description: string;
}

const VISION_PROMPT = `You are an expert trading chart analyst. Extract trade parameters from the screenshot — especially TradingView "Long Position" or "Short Position" drawing tools.

Return ONLY valid JSON (no markdown):
{
  "symbol": "VIX25",
  "direction": "BUY",
  "entryMin": 839132.0,
  "entryMax": 839500.0,
  "stopLoss": 836968.0,
  "takeProfit": 869018.0,
  "description": "Brief thesis matching the visible setup."
}

CRITICAL — TradingView position tool:
- "Long Position" / long tool with TP box ABOVE entry and SL box BELOW → direction "BUY"
- "Short Position" / short tool with TP BELOW and SL ABOVE → direction "SELL"
- Read the numeric labels on the tool lines (entry, SL, TP) — not just candle prices
- entryMin = bottom of entry zone, entryMax = top of entry zone (entryMin < entryMax always)

Symbol mapping:
- Volatility 25 (1s) Index, 1HZ25V → VIX25
- Volatility 75 (1s) Index, 1HZ75V → VIX75
- Volatility 10/50/100 → VIX10, VIX50, VIX100
- XAUUSD, EURUSD, NAS100, BTCUSD as shown

Price rules:
- Synthetic volatility indices (VIX10/25/50/75/100) often trade 50,000–900,000 — keep full magnitude (839132 not 839.132)
- Strip thousand separators: "842,351.73" → 842351.73
- For BUY: stopLoss < entryMin AND takeProfit > entryMax
- For SELL: stopLoss > entryMax AND takeProfit < entryMin
- Description must match direction (BUY = bullish/long thesis, SELL = bearish/short thesis)`;

@Injectable()
export class VisionService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY') || '';
    this.model = this.config.get<string>('OPENAI_VISION_MODEL') || 'gpt-4o';
    this.baseUrl =
      this.config.get<string>('OPENAI_API_URL') || 'https://api.openai.com/v1';
  }

  async analyzeChartSetup(
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<ChartAnalysisResult> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('OpenAI Vision API key is not configured');
    }

    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new InternalServerErrorException(
        `Vision analysis failed: ${errText.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new InternalServerErrorException('Empty response from vision model');
    }

    return this.parseAnalysis(content);
  }

  private parseAnalysis(raw: string): ChartAnalysisResult {
    let parsed: Record<string, unknown>;
    try {
      const cleaned = raw
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '');
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new InternalServerErrorException('Could not parse AI response');
    }

    const symbol = normalizeChartSymbol(String(parsed.symbol || ''));
    const direction = String(parsed.direction || '').toUpperCase();
    const entryMin = parseChartPrice(parsed.entryMin);
    const entryMax = parseChartPrice(parsed.entryMax);
    const stopLoss = parseChartPrice(parsed.stopLoss);
    const takeProfit = parseChartPrice(parsed.takeProfit);
    const description = String(parsed.description || '').trim();

    if (!symbol || !['BUY', 'SELL'].includes(direction)) {
      throw new InternalServerErrorException('AI could not identify symbol or direction');
    }

    if (
      [entryMin, entryMax, stopLoss, takeProfit].some((n) => !Number.isFinite(n)) ||
      entryMin >= entryMax
    ) {
      throw new InternalServerErrorException('AI returned invalid price levels');
    }

    const rawResult: ChartAnalysisResult = {
      symbol,
      direction: direction as 'BUY' | 'SELL',
      entryMin,
      entryMax,
      stopLoss,
      takeProfit,
      description: description || 'Setup extracted from chart screenshot.',
    };

    const normalized = normalizeChartSetup(rawResult);
    const validationError = validateChartSetup(normalized);
    if (validationError) {
      throw new InternalServerErrorException(
        `AI could not read levels correctly — ${validationError}. Adjust fields manually.`,
      );
    }

    return normalized;
  }
}
