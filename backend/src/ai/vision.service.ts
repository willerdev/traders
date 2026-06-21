import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChartAnalysisResult {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  description: string;
}

const VISION_PROMPT = `You are an expert trading chart analyst. Analyze this trading setup screenshot and extract the trade parameters marked on the chart (entry zone, stop loss, take profit, symbol/pair, direction).

Return ONLY valid JSON with this exact shape (no markdown):
{
  "symbol": "EURUSD",
  "direction": "BUY",
  "entryMin": 1.0820,
  "entryMax": 1.0860,
  "stopLoss": 1.0780,
  "takeProfit": 1.0950,
  "description": "Brief trade thesis based on visible chart structure, key levels, and confluence."
}

Rules:
- symbol: uppercase trading pair (e.g. EURUSD, BTCUSD, XAUUSD, NAS100)
- direction: exactly "BUY" or "SELL"
- entryMin must be less than entryMax
- For BUY: stopLoss below entry zone, takeProfit above entry zone
- For SELL: stopLoss above entry zone, takeProfit below entry zone
- Read price levels from chart labels, lines, and annotations; estimate if approximate
- description: 2-4 sentences explaining the setup visible on the chart`;

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

    const symbol = String(parsed.symbol || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const direction = String(parsed.direction || '').toUpperCase();
    const entryMin = Number(parsed.entryMin);
    const entryMax = Number(parsed.entryMax);
    const stopLoss = Number(parsed.stopLoss);
    const takeProfit = Number(parsed.takeProfit);
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

    return {
      symbol,
      direction: direction as 'BUY' | 'SELL',
      entryMin,
      entryMax,
      stopLoss,
      takeProfit,
      description: description || 'Setup extracted from chart screenshot.',
    };
  }
}
