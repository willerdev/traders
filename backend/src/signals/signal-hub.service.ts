import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TradeDirection } from '@prisma/client';
import { CreateSignalDto } from '../common/dto';

type SignalHubAction =
  | 'open'
  | 'add'
  | 'close'
  | 'breakeven'
  | 'modify'
  | 'partial_close'
  | 'close_all'
  | 'ignore';

type SignalHubOrderType = 'market' | 'limit' | 'stop';

interface SignalHubPayload {
  external_id: string;
  action: SignalHubAction;
  order_type: SignalHubOrderType;
  symbol: string;
  direction: 'buy' | 'sell';
  entry: number;
  sl: number;
  tp: number;
  sendername: string;
  provider_name: string;
  message: string;
}

export interface SignalHubResult {
  id: string;
  external_id: string | null;
  status: string;
  duplicate: boolean;
}

@Injectable()
export class SignalHubService {
  private readonly logger = new Logger(SignalHubService.name);
  private readonly baseUrl: string;
  private readonly providerKey: string;
  private readonly providerName: string;
  private readonly orderType: SignalHubOrderType;

  constructor(private config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('SIGNAL_HUB_URL') ||
      'https://signalhub-10zp.onrender.com';
    this.providerKey =
      this.config.get<string>('SIGNAL_HUB_PROVIDER_KEY') || '';
    this.providerName =
      this.config.get<string>('SIGNAL_HUB_PROVIDER_NAME') ||
      'TraderRank Pro';
    this.orderType =
      (this.config.get<string>('SIGNAL_HUB_ORDER_TYPE') as SignalHubOrderType) ||
      'limit';
  }

  get isConfigured(): boolean {
    return Boolean(this.providerKey);
  }

  private toDirection(direction: TradeDirection): 'buy' | 'sell' {
    return direction === 'BUY' ? 'buy' : 'sell';
  }

  private toSenderName(displayName: string, userId: string): string {
    const normalized = displayName
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);

    if (normalized.length >= 1) return normalized;
    return `trader_${userId.slice(0, 8)}`;
  }

  buildPayload(
    externalId: string,
    dto: CreateSignalDto,
    displayName: string,
    userId: string,
  ): SignalHubPayload {
    return {
      external_id: externalId,
      action: 'open',
      order_type: this.orderType,
      symbol: dto.symbol.trim().toUpperCase(),
      direction: this.toDirection(dto.direction),
      entry: (dto.entryMin + dto.entryMax) / 2,
      sl: dto.stopLoss,
      tp: dto.takeProfit,
      sendername: this.toSenderName(displayName, userId),
      provider_name: this.providerName,
      message: dto.description.trim().slice(0, 4000),
    };
  }

  async forwardSignal(
    externalId: string,
    dto: CreateSignalDto,
    displayName: string,
    userId: string,
  ): Promise<SignalHubResult | null> {
    if (!this.isConfigured) {
      this.logger.warn('Signal Hub skipped — SIGNAL_HUB_PROVIDER_KEY not set');
      return null;
    }

    const payload = this.buildPayload(externalId, dto, displayName, userId);

    try {
      const res = await fetch(`${this.baseUrl}/v1/signals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-provider-key': this.providerKey,
        },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as SignalHubResult & {
        detail?: unknown;
      };

      if (!res.ok) {
        this.logger.error(
          `Signal Hub rejected ${externalId}: ${res.status} ${JSON.stringify(body)}`,
        );
        return null;
      }

      this.logger.log(
        `Signal Hub accepted ${externalId} → hub id ${body.id} (${body.status})`,
      );
      return body;
    } catch (err) {
      this.logger.error(
        `Signal Hub request failed for ${externalId}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
