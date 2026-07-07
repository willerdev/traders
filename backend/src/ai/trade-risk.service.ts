import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TradeDirection } from '@prisma/client';
import { RISK_PERCENT } from '../common/constants';
import {
  MetaApiAccount,
  MetaApiService,
  MetaApiSymbolPrice,
  MetaApiSymbolSpec,
} from '../metaapi/metaapi.service';

export type TradeRiskInput = {
  account: MetaApiAccount;
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskPercent?: number;
  maxRiskAmount?: number;
  /** Skip DeepSeek volume review for faster order placement on submit. */
  skipAiReview?: boolean;
};

export type TradeRiskResult = {
  volume: number;
  riskPercent: number;
  riskAmount: number;
  estimatedLossAtSl: number;
  accountEquity: number;
  accountBalance: number;
  currency: string;
  aiManaged: boolean;
  aiNotes: string[];
  stopLoss: number;
  takeProfit: number;
};

@Injectable()
export class TradeRiskService {
  private readonly logger = new Logger(TradeRiskService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private config: ConfigService,
    private metaApi: MetaApiService,
  ) {
    this.apiKey = this.config.get<string>('DEEPSEEK_API_KEY') || '';
    this.model = this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    this.baseUrl =
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1';
  }

  private volumeDecimals(step: number): number {
    const s = String(step);
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
  }

  private roundVolume(volume: number, step: number, min: number, max: number) {
    const decimals = this.volumeDecimals(step);
    const steps = Math.ceil(volume / step - 1e-9);
    let v = steps * step;
    if (v < min) v = min;
    if (v > max) v = max;
    return Number(v.toFixed(decimals));
  }

  private riskPerLot(
    slDistance: number,
    spec: MetaApiSymbolSpec,
    price?: MetaApiSymbolPrice & {
      lossTickValue?: number;
    },
  ): number {
    const tickSize = spec.tickSize > 0 ? spec.tickSize : 0.00001;
    const ticks = slDistance / tickSize;
    const lossTick = Number(price?.lossTickValue ?? 0);
    if (lossTick > 0 && Number.isFinite(ticks)) {
      return ticks * lossTick;
    }
    const contractSize = spec.contractSize > 0 ? spec.contractSize : 100_000;
    return slDistance * contractSize;
  }

  private baseVolume(input: {
    equity: number;
    riskPercent: number;
    maxRiskAmount?: number;
    slDistance: number;
    spec: MetaApiSymbolSpec;
    price: MetaApiSymbolPrice;
  }) {
    const targetRisk = Math.min(
      input.equity * (input.riskPercent / 100),
      input.maxRiskAmount ?? Infinity,
    );
    if (targetRisk <= 0 || input.slDistance <= 0) {
      throw new BadRequestException('Cannot size trade — invalid SL distance or balance');
    }

    const perLot = this.riskPerLot(input.slDistance, input.spec, input.price);
    if (perLot <= 0) {
      throw new BadRequestException('Cannot estimate risk per lot for this symbol');
    }

    let volume = targetRisk / perLot;
    volume = this.roundVolume(
      volume,
      input.spec.volumeStep,
      input.spec.minVolume,
      input.spec.maxVolume,
    );

    let loss = volume * perLot;
    while (loss < targetRisk && volume + input.spec.volumeStep <= input.spec.maxVolume) {
      volume = this.roundVolume(
        volume + input.spec.volumeStep,
        input.spec.volumeStep,
        input.spec.minVolume,
        input.spec.maxVolume,
      );
      loss = volume * perLot;
    }

    return { volume, targetRisk, perLot, estimatedLossAtSl: loss };
  }

  private async aiReviewVolume(input: {
    symbol: string;
    direction: TradeDirection;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    equity: number;
    currency: string;
    riskPercent: number;
    calculatedVolume: number;
    estimatedLossAtSl: number;
    spec: MetaApiSymbolSpec;
  }): Promise<{ volume: number; notes: string[] } | null> {
    if (!this.apiKey) return null;

    const prompt = `You are a professional risk manager for MT5 live trading. Size the position so that if stop loss is hit, the account loses AT LEAST ${input.riskPercent}% of equity — never less.

CRITICAL: Do NOT change stopLoss or takeProfit. Only adjust volume (lot size).

Account equity: ${input.equity} ${input.currency}
Target risk: ${input.riskPercent}% = ${(input.equity * input.riskPercent) / 100} ${input.currency}
Symbol: ${input.symbol}
Direction: ${input.direction}
Entry (market): ${input.entryPrice}
Stop loss (fixed): ${input.stopLoss}
Take profit (fixed): ${input.takeProfit}
Broker min/max/step volume: ${input.spec.minVolume} / ${input.spec.maxVolume} / ${input.spec.volumeStep}
Calculated volume: ${input.calculatedVolume} lots
Estimated loss at SL: ${input.estimatedLossAtSl} ${input.currency}

Return ONLY valid JSON:
{
  "approved": true,
  "volume": 0.12,
  "notes": ["brief reason"]
}

Rules:
- volume must be >= ${input.spec.minVolume} and <= ${input.spec.maxVolume}
- round volume to broker step ${input.spec.volumeStep}
- if calculated volume already meets >= ${input.riskPercent}% risk at SL, approve it
- only increase volume if estimated loss is below ${input.riskPercent}% of equity
- never suggest changing SL or TP`;

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        this.logger.warn(`AI risk review failed (${res.status})`);
        return null;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) return null;

      const parsed = JSON.parse(raw) as {
        approved?: boolean;
        volume?: number;
        notes?: string[];
      };
      if (!parsed.approved || parsed.volume == null) return null;

      const volume = this.roundVolume(
        Number(parsed.volume),
        input.spec.volumeStep,
        input.spec.minVolume,
        input.spec.maxVolume,
      );

      return {
        volume,
        notes: Array.isArray(parsed.notes)
          ? parsed.notes.map(String)
          : ['AI risk review applied'],
      };
    } catch (err) {
      this.logger.warn(
        `AI risk review error: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async calculatePositionSize(input: TradeRiskInput): Promise<TradeRiskResult> {
    const riskPercent = input.riskPercent ?? RISK_PERCENT;
    const account = await this.metaApi.ensureAccountReady(input.account.id);
    const brokerSymbol = input.symbol;

    const [accountInfo, spec, price] = await Promise.all([
      this.metaApi.getAccountInformation(account),
      this.metaApi.getSymbolSpecification(account, brokerSymbol),
      this.metaApi.getSymbolPrice(account, brokerSymbol),
    ]);

    if (!accountInfo.tradeAllowed) {
      throw new BadRequestException('Trading is not allowed on this account');
    }

    const equity = accountInfo.equity > 0 ? accountInfo.equity : accountInfo.balance;
    const slDistance = Math.abs(input.entryPrice - input.stopLoss);
    if (slDistance <= 0) {
      throw new BadRequestException('Stop loss must differ from entry price');
    }

    const base = this.baseVolume({
      equity,
      riskPercent,
      maxRiskAmount: input.maxRiskAmount,
      slDistance,
      spec,
      price,
    });

    let volume = base.volume;
    let estimatedLossAtSl = base.estimatedLossAtSl;
    const aiNotes: string[] = [
      `Sized for ${riskPercent}% risk (${base.targetRisk.toFixed(2)} ${accountInfo.currency})`,
    ];
    let aiManaged = false;

    const ai = input.skipAiReview
      ? null
      : await this.aiReviewVolume({
          symbol: spec.symbol,
          direction: input.direction,
          entryPrice: input.entryPrice,
          stopLoss: input.stopLoss,
          takeProfit: input.takeProfit,
          equity,
          currency: accountInfo.currency,
          riskPercent,
          calculatedVolume: volume,
          estimatedLossAtSl,
          spec,
        });

    if (ai) {
      aiManaged = true;
      volume = ai.volume;
      estimatedLossAtSl = volume * base.perLot;
      aiNotes.push(...ai.notes);
    }

    return {
      volume,
      riskPercent,
      riskAmount: base.targetRisk,
      estimatedLossAtSl,
      accountEquity: equity,
      accountBalance: accountInfo.balance,
      currency: accountInfo.currency,
      aiManaged,
      aiNotes,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
    };
  }
}
