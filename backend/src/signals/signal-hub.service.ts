import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TradeDirection } from '@prisma/client';
import { CreateSignalDto } from '../common/dto';
import { SignalValidationService } from '../ai/signal-validation.service';
import { normalizeChartSymbol } from '../ai/chart-setup.util';

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

const VALID_ORDER_TYPES: SignalHubOrderType[] = ['market', 'limit', 'stop'];

function parseOrderType(raw?: string): SignalHubOrderType {
  const value = (raw || 'limit').trim().toLowerCase();
  if (VALID_ORDER_TYPES.includes(value as SignalHubOrderType)) {
    return value as SignalHubOrderType;
  }
  if (/\bmarket\b/.test(value)) return 'market';
  if (/\bstop\b/.test(value)) return 'stop';
  if (/\blimit\b/.test(value)) return 'limit';
  return 'limit';
}

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
  image_url?: string;
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
  forwarded: boolean;
  hubError?: string;
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
  private readonly providerName: string;
  private readonly lotScale: number | null;
  private readonly apiPublicUrl: string | null;
  private readonly callbackUrl: string | null;

  constructor(
    private config: ConfigService,
    private signalValidation: SignalValidationService,
  ) {
    this.baseUrl =
      this.config.get<string>('SIGNAL_HUB_URL') ||
      process.env.SIGNAL_HUB_URL ||
      'https://signalhub-10zp.onrender.com';
    this.providerName =
      this.config.get<string>('SIGNAL_HUB_PROVIDER_NAME') ||
      process.env.SIGNAL_HUB_PROVIDER_NAME ||
      'TraderRank Pro';
    const scale = Number(
      this.config.get<string>('SIGNAL_HUB_LOT_SCALE') ||
        process.env.SIGNAL_HUB_LOT_SCALE,
    );
    this.lotScale = Number.isFinite(scale) ? scale : 1.0;
    const apiPublic =
      this.config.get<string>('API_PUBLIC_URL')?.replace(/\/$/, '') ||
      process.env.API_PUBLIC_URL?.replace(/\/$/, '') ||
      null;
    this.apiPublicUrl = apiPublic;
    this.callbackUrl = apiPublic
      ? `${apiPublic}/api/v1/signals/hub/callback`
      : null;
  }

  /** Signal Hub requires HTTPS chart URLs for Telegram forwarding. */
  private resolveHubImageUrl(screenshotUrl: string): string | undefined {
    const raw = screenshotUrl.trim();
    if (!raw) return undefined;

    if (raw.startsWith('https://')) return raw;

    if (raw.startsWith('/')) {
      if (!this.apiPublicUrl?.startsWith('https://')) return undefined;
      return `${this.apiPublicUrl}${raw}`;
    }

    if (this.apiPublicUrl?.startsWith('https://')) {
      return `${this.apiPublicUrl}/${raw.replace(/^\//, '')}`;
    }

    return undefined;
  }

  private getOrderType(): SignalHubOrderType {
    const raw =
      this.config.get<string>('SIGNAL_HUB_ORDER_TYPE') ||
      process.env.SIGNAL_HUB_ORDER_TYPE;
    return parseOrderType(raw);
  }

  /** Read at request time — Render env updates need redeploy, not app restart hacks. */
  private getProviderKey(): string {
    const raw =
      this.config.get<string>('SIGNAL_HUB_PROVIDER_KEY') ||
      process.env.SIGNAL_HUB_PROVIDER_KEY ||
      '';
    return raw.trim().replace(/^['"]+|['"]+$/g, '');
  }

  get isConfigured(): boolean {
    return this.getProviderKey().length > 0;
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
  ): Promise<{ data: T | null; error?: string }> {
    if (!this.isConfigured) {
      return { data: null, error: 'SIGNAL_HUB_PROVIDER_KEY is not configured' };
    }

    try {
      const providerKey = this.getProviderKey();
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-provider-key': providerKey,
          ...(options.headers as Record<string, string>),
        },
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail =
          typeof body === 'object' && body && 'detail' in body
            ? JSON.stringify((body as { detail: unknown }).detail)
            : JSON.stringify(body);
        const message = `Signal Hub ${res.status}: ${detail}`;
        this.logger.error(
          `Signal Hub ${options.method || 'GET'} ${path}: ${message}`,
        );
        return { data: null, error: message };
      }

      return { data: body as T };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Signal Hub request failed ${path}: ${message}`);
      return { data: null, error: message };
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
      order_type: this.getOrderType(),
      symbol: normalizeChartSymbol(dto.symbol),
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

    const imageUrl = this.resolveHubImageUrl(dto.screenshotUrl);
    if (imageUrl) {
      payload.image_url = imageUrl;
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
        forwarded: false,
        hubError: validation.rejectReason || 'Signal rejected by AI validation',
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
        forwarded: false,
        hubError: 'SIGNAL_HUB_PROVIDER_KEY is not configured on the server',
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

    const { data: body, error } = await this.hubRequest<SignalHubResult>(
      '/v1/signals',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );

    if (body) {
      this.logger.log(
        `Signal Hub accepted ${externalId} → hub id ${body.id} (${body.status})`,
      );
    }

    return {
      hub: body,
      forwarded: Boolean(body),
      hubError: body ? undefined : error || 'Signal Hub did not accept the signal',
      validation: {
        approved: true,
        adjusted: validation.adjusted,
        issues: validation.issues,
        sentPrices,
      },
    };
  }

  async getHubHealth() {
    const key = this.getProviderKey();
    const rawOrderType =
      this.config.get<string>('SIGNAL_HUB_ORDER_TYPE') ||
      process.env.SIGNAL_HUB_ORDER_TYPE ||
      null;
    const orderType = this.getOrderType();
    if (rawOrderType && rawOrderType.trim().toLowerCase() !== orderType) {
      this.logger.warn(
        `SIGNAL_HUB_ORDER_TYPE "${rawOrderType}" normalized to "${orderType}"`,
      );
    }
    return {
      configured: key.length > 0,
      baseUrl: this.baseUrl,
      providerName: this.providerName,
      orderType,
      rawOrderType,
      lotScale: this.lotScale,
      keyHint: key ? `${key.slice(0, 10)}…` : null,
    };
  }

  async getByExternalId(externalId: string, sendername: string) {
    const q = new URLSearchParams({ sendername });
    const { data } = await this.hubRequest<SignalHubResult>(
      `/v1/signals/external/${encodeURIComponent(externalId)}?${q}`,
    );
    return data;
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

    const { data } = await this.hubRequest<SignalHubListResult>(
      `/v1/signals?${q}`,
    );
    return data;
  }

  async getLogs(
    sendername: string,
    filters?: { signal_id?: string; limit?: number; offset?: number },
  ) {
    const q = new URLSearchParams({ sendername });
    if (filters?.signal_id) q.set('signal_id', filters.signal_id);
    if (filters?.limit) q.set('limit', String(filters.limit));
    if (filters?.offset) q.set('offset', String(filters.offset));

    const { data } = await this.hubRequest<SignalHubLogsResult>(
      `/v1/logs?${q}`,
    );
    return data;
  }

  async getPositions(sendername: string) {
    const q = new URLSearchParams({ sendername });
    const { data } = await this.hubRequest<SignalHubPositionsResult>(
      `/v1/positions?${q}`,
    );
    return data;
  }

  async closePosition(ticket: number, sendername: string) {
    const q = new URLSearchParams({ sendername });
    const { data } = await this.hubRequest<{
      ok: boolean;
      ticket: number;
      symbol?: string;
      profit?: number;
      sendername?: string;
    }>(`/v1/positions/${ticket}/close?${q}`, { method: 'POST' });
    return data;
  }

  async closeAllPositions(sendername: string) {
    const q = new URLSearchParams({ sendername });
    const { data } = await this.hubRequest<{
      ok: boolean;
      closed: number;
      count: number;
      items: Record<string, unknown>[];
      sendername?: string;
    }>(`/v1/positions/close-all?${q}`, { method: 'POST' });
    return data;
  }
}
