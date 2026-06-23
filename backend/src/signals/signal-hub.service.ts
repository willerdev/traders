import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TradeDirection } from '@prisma/client';
import { CreateSignalDto } from '../common/dto';
import { SignalValidationService } from '../ai/signal-validation.service';

export type SignalHubAction =
  | 'open'
  | 'add'
  | 'close'
  | 'breakeven'
  | 'modify'
  | 'partial_close'
  | 'close_all'
  | 'ignore';

export type SignalHubOrderType = 'market' | 'limit' | 'stop';

export interface SignalHubPayload {
  external_id: string;
  action: SignalHubAction;
  order_type: SignalHubOrderType;
  symbol: string;
  direction: 'buy' | 'sell';
  entry: number;
  sl: number;
  tp: number;
  lot_scale?: number;
  sendername: string;
  provider_name: string;
  message: string;
  callback_url?: string;
}

export interface SignalHubResult {
  id: string;
  external_id: string | null;
  status: string;
  duplicate: boolean;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  progress?: { stage: string; message: string; executed: boolean } | null;
  created_at?: string;
  acked_at?: string | null;
}

export interface SignalHubListResult {
  items: SignalHubResult[];
  count: number;
  sendername?: string | null;
}

export interface SignalHubEvent {
  id: string;
  signal_id: string | null;
  sendername: string | null;
  event: string;
  message: string;
  detail?: Record<string, unknown> | null;
  created_at: string;
}

export interface SignalHubLogsResult {
  items: SignalHubEvent[];
  count: number;
  sendername?: string | null;
}

export interface SignalHubPosition {
  ticket?: number;
  symbol?: string;
  type?: string;
  volume?: number;
  price_open?: number;
  sl?: number;
  tp?: number;
  profit?: number;
  [key: string]: unknown;
}

export interface SignalHubPositionsResult {
  sendername: string;
  count: number;
  items: SignalHubPosition[];
}

export interface ForwardSignalResult {
  hub: SignalHubResult | null;
  validation: {
    approved: boolean;
    adjusted: boolean;
    issues: string[];
    rejectReason?: string;
    sentPrices?: {
      symbol: string;
      direction: string;
      entry: number;
      sl: number;
      tp: number;
    };
  };
}

@Injectable()
export class SignalHubService {
  private readonly logger = new Logger(SignalHubService.name);
  private readonly baseUrl: string;
  private readonly providerKey: string;
  private readonly providerName: string;
  private readonly orderType: SignalHubOrderType;
  private readonly lotScale: number | null;
  private readonly callbackUrl: string | null;

  constructor(
    private config: ConfigService,
    private signalValidation: SignalValidationService,
  ) {
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
    const scale = Number(this.config.get<string>('SIGNAL_HUB_LOT_SCALE'));
    this.lotScale = Number.isFinite(scale) ? scale : 1.0;
    const apiPublic = this.config.get<string>('API_PUBLIC_URL')?.replace(/\/$/, '');
    this.callbackUrl = apiPublic
      ? `${apiPublic}/api/v1/signals/hub/callback`
      : null;
  }

  get isConfigured(): boolean {
    return Boolean(this.providerKey);
  }

  toSenderName(displayName: string, userId: string): string {
    const normalized = displayName
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);

    if (normalized.length >= 1) return normalized;
    return `trader_${userId.slice(0, 8)}`;
  }

  private toDirection(direction: TradeDirection): 'buy' | 'sell' {
    return direction === 'BUY' ? 'buy' : 'sell';
  }

  private async hubRequest<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T | null> {
    if (!this.isConfigured) return null;

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-provider-key': this.providerKey,
          ...(options.headers as Record<string, string>),
        },
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        this.logger.error(
          `Signal Hub ${options.method || 'GET'} ${path}: ${res.status} ${JSON.stringify(body)}`,
        );
        return null;
      }

      return body as T;
    } catch (err) {
      this.logger.error(
        `Signal Hub request failed ${path}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  buildPayload(
    externalId: string,
    dto: CreateSignalDto,
    displayName: string,
    userId: string,
  ): SignalHubPayload {
    const payload: SignalHubPayload = {
      external_id: externalId,
      action: 'open',
      order_type: this.orderType,
      symbol: dto.symbol.trim().toUpperCase(),
      direction: this.toDirection(dto.direction),
      entry: (dto.entryMin + dto.entryMax) / 2,
      sl: dto.stopLoss,
      tp: dto.takeProfit,
      lot_scale: this.lotScale ?? undefined,
      sendername: this.toSenderName(displayName, userId),
      provider_name: this.providerName,
      message: dto.description.trim().slice(0, 4000),
    };

    if (this.callbackUrl?.startsWith('https://')) {
      payload.callback_url = this.callbackUrl;
    }

    return payload;
  }

  async forwardSignal(
    externalId: string,
    dto: CreateSignalDto,
    displayName: string,
    userId: string,
  ): Promise<ForwardSignalResult> {
    const validation = await this.signalValidation.validateAndCorrect(dto);

    if (!validation.approved) {
      this.logger.warn(
        `Signal Hub skipped ${externalId}: ${validation.rejectReason}`,
      );
      return {
        hub: null,
        validation: {
          approved: false,
          adjusted: validation.adjusted,
          issues: validation.issues,
          rejectReason: validation.rejectReason,
        },
      };
    }

    if (!this.isConfigured) {
      this.logger.warn('Signal Hub skipped — SIGNAL_HUB_PROVIDER_KEY not set');
      return {
        hub: null,
        validation: {
          approved: true,
          adjusted: validation.adjusted,
          issues: validation.issues,
        },
      };
    }

    const safeDto = validation.dto;
    const payload = this.buildPayload(externalId, safeDto, displayName, userId);
    const sentPrices = {
      symbol: payload.symbol,
      direction: payload.direction,
      entry: payload.entry,
      sl: payload.sl,
      tp: payload.tp,
    };

    const body = await this.hubRequest<SignalHubResult>('/v1/signals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (body) {
      this.logger.log(
        `Signal Hub accepted ${externalId} → hub id ${body.id} (${body.status})`,
      );
    }

    return {
      hub: body,
      validation: {
        approved: true,
        adjusted: validation.adjusted,
        issues: validation.issues,
        sentPrices,
      },
    };
  }

  async getByExternalId(externalId: string, sendername: string) {
    const q = new URLSearchParams({ sendername });
    return this.hubRequest<SignalHubResult>(
      `/v1/signals/external/${encodeURIComponent(externalId)}?${q}`,
    );
  }

  async listSignals(
    sendername: string,
    filters?: {
      status?: string;
      external_id?: string;
      limit?: number;
      offset?: number;
      since?: string;
    },
  ) {
    const q = new URLSearchParams({ sendername });
    if (filters?.status) q.set('status', filters.status);
    if (filters?.external_id) q.set('external_id', filters.external_id);
    if (filters?.limit) q.set('limit', String(filters.limit));
    if (filters?.offset) q.set('offset', String(filters.offset));
    if (filters?.since) q.set('since', filters.since);

    return this.hubRequest<SignalHubListResult>(`/v1/signals?${q}`);
  }

  async getLogs(
    sendername: string,
    filters?: { signal_id?: string; limit?: number; offset?: number },
  ) {
    const q = new URLSearchParams({ sendername });
    if (filters?.signal_id) q.set('signal_id', filters.signal_id);
    if (filters?.limit) q.set('limit', String(filters.limit));
    if (filters?.offset) q.set('offset', String(filters.offset));

    return this.hubRequest<SignalHubLogsResult>(`/v1/logs?${q}`);
  }

  async getPositions(sendername: string) {
    const q = new URLSearchParams({ sendername });
    return this.hubRequest<SignalHubPositionsResult>(`/v1/positions?${q}`);
  }

  async closePosition(ticket: number, sendername: string) {
    const q = new URLSearchParams({ sendername });
    return this.hubRequest<{
      ok: boolean;
      ticket: number;
      symbol?: string;
      profit?: number;
      sendername?: string;
    }>(`/v1/positions/${ticket}/close?${q}`, { method: 'POST' });
  }

  async closeAllPositions(sendername: string) {
    const q = new URLSearchParams({ sendername });
    return this.hubRequest<{
      ok: boolean;
      closed: number;
      count: number;
      items: Record<string, unknown>[];
      sendername?: string;
    }>(`/v1/positions/close-all?${q}`, { method: 'POST' });
  }
}
