import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TradeDirection } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { CreateSignalDto } from '../common/dto';
import { SignalValidationService } from '../ai/signal-validation.service';
import { normalizeChartSymbol } from '../ai/chart-setup.util';
import { getSymbolLookupVariants } from '../ai/deriv-symbols';
import {
  resolveHubPendingOrderType,
  resolvePendingOpenPrice,
} from '../metaapi/metaapi-order.util';

export type SignalHubAction =
  | 'open'
  | 'add'
  | 'close'
  | 'breakeven'
  | 'modify'
  | 'partial_close'
  | 'close_all'
  | 'ignore';

export type SignalHubOrderType = 'limit' | 'stop';

const VALID_ORDER_TYPES: SignalHubOrderType[] = ['limit', 'stop'];

function parseOrderType(raw?: string): SignalHubOrderType {
  const value = (raw || 'limit').trim().toLowerCase();
  if (VALID_ORDER_TYPES.includes(value as SignalHubOrderType)) {
    return value as SignalHubOrderType;
  }
  if (/\bstop\b/.test(value)) return 'stop';
  if (/\bmarket\b/.test(value)) return 'limit';
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
  confidence?: number;
  image_url?: string;
  image_base64?: string;
  image_mime?: string;
  lot?: number;
  ticket?: number;
}

export interface SignalHubQuote {
  symbol: string;
  resolved_symbol: string;
  bid: number;
  ask: number;
  price: number;
  mid: number;
  spread: number;
  digits?: number;
  point?: number;
  time: string;
  source?: string;
}

export interface SignalHubSenderStat {
  rank?: number;
  sendername: string;
  signals?: number;
  closed_trades?: number;
  wins?: number;
  losses?: number;
  win_rate?: number;
  net_profit?: number;
  gross_profit?: number;
  gross_loss?: number;
  profit_factor?: number;
  expectancy?: number;
  [key: string]: unknown;
}

export interface SignalHubSenderReport {
  days: number;
  sort?: string;
  min_closed_trades?: number;
  total_senders: number;
  returned: number;
  generated_at?: string | null;
  summary?: Record<string, unknown> | null;
  senders: SignalHubSenderStat[];
}

export interface HubActionInput {
  action: SignalHubAction;
  symbol?: string;
  direction?: 'buy' | 'sell';
  entry?: number;
  sl?: number;
  tp?: number;
  lot?: number;
  ticket?: number;
  external_id?: string;
  message?: string;
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
    const webhookSecret =
      this.config.get<string>('TRADE_OUTCOME_WEBHOOK_SECRET')?.trim() ||
      process.env.TRADE_OUTCOME_WEBHOOK_SECRET?.trim() ||
      '';
    const callbackBase = apiPublic
      ? `${apiPublic}/api/v1/signals/hub/callback`
      : null;
    this.callbackUrl =
      callbackBase && webhookSecret
        ? `${callbackBase}?key=${encodeURIComponent(webhookSecret)}`
        : callbackBase;
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

  private mimeFromPath(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
  }

  private resolveLocalScreenshotPath(screenshotUrl: string): string | null {
    const raw = screenshotUrl.trim();
    if (!raw) return null;

    const match = raw.match(/\/uploads\/setups\/([^/?#]+)/i);
    if (!match) return null;

    const filePath = join(process.cwd(), 'uploads', 'setups', match[1]);
    return existsSync(filePath) ? filePath : null;
  }

  private attachScreenshotToPayload(
    payload: SignalHubPayload,
    screenshotUrl: string,
  ): void {
    const imageUrl = this.resolveHubImageUrl(screenshotUrl);
    if (imageUrl) {
      payload.image_url = imageUrl;
      return;
    }

    const localPath = this.resolveLocalScreenshotPath(screenshotUrl);
    if (!localPath) return;

    try {
      const buf = readFileSync(localPath);
      if (buf.length > 5_000_000) {
        this.logger.warn(
          `Screenshot too large for Hub base64 (${buf.length} bytes) — skipping`,
        );
        return;
      }
      payload.image_base64 = buf.toString('base64');
      payload.image_mime = this.mimeFromPath(localPath);
    } catch (err) {
      this.logger.warn(
        `Could not read screenshot for Hub: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private getOrderType(): SignalHubOrderType {
    const raw =
      this.config.get<string>('SIGNAL_HUB_ORDER_TYPE') ||
      process.env.SIGNAL_HUB_ORDER_TYPE;
    const parsed = parseOrderType(raw);
    if (raw?.trim().toLowerCase().includes('market')) {
      this.logger.warn(
        'SIGNAL_HUB_ORDER_TYPE "market" is not allowed for submitted setups — using limit/stop auto-resolution',
      );
    }
    return parsed;
  }

  /**
   * Submitted setups always queue pending orders (limit or stop) at the entry zone edge.
   * Market execution is only available via Place trade (MetaAPI) in the setup modal.
   */
  private resolveSubmittedOrder(
    dto: CreateSignalDto,
    marketPrice: number | null,
  ): { orderType: SignalHubOrderType; entry: number } {
    const entryMin = dto.entryMin;
    const entryMax = dto.entryMax;

    if (marketPrice != null && Number.isFinite(marketPrice)) {
      const entry = resolvePendingOpenPrice(
        dto.direction,
        entryMin,
        entryMax,
        marketPrice,
      );
      return {
        orderType: resolveHubPendingOrderType(
          dto.direction,
          entry,
          marketPrice,
        ),
        entry,
      };
    }

    // No live quote — still place at entry zone edge (not midpoint) as pending limit.
    const entry = dto.direction === 'BUY' ? entryMin : entryMax;
    return {
      orderType: 'limit',
      entry,
    };
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
    confidence?: number,
    order?: { orderType: SignalHubOrderType; entry: number },
  ): SignalHubPayload {
    const resolved =
      order ??
      this.resolveSubmittedOrder(dto, null);
    const payload: SignalHubPayload = {
      external_id: externalId,
      action: 'open',
      order_type: resolved.orderType,
      symbol: normalizeChartSymbol(dto.symbol),
      direction: this.toDirection(dto.direction),
      entry: resolved.entry,
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

    if (confidence !== undefined && Number.isFinite(confidence)) {
      payload.confidence = Math.max(0, Math.min(100, Math.round(confidence)));
    }

    this.attachScreenshotToPayload(payload, dto.screenshotUrl);

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
    const marketMid = await this.getQuoteMid(safeDto.symbol);
    const submittedOrder = this.resolveSubmittedOrder(safeDto, marketMid);
    const payload = this.buildPayload(
      externalId,
      safeDto,
      displayName,
      userId,
      validation.confidence,
      submittedOrder,
    );
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

  async invalidateByExternalId(
    externalId: string,
    sendername: string,
    reason?: string,
    alternateSendernames: string[] = [],
  ): Promise<{
    data: {
      id: string;
      status: string;
      ok?: boolean;
      duplicate?: boolean;
      progress?: { stage: string; message: string; executed: boolean };
    } | null;
    error?: string;
    notOnHub?: boolean;
  }> {
    const senders = [
      ...new Set(
        [sendername, ...alternateSendernames].map((s) => s.trim()).filter(Boolean),
      ),
    ];

    for (const sn of senders) {
      const existing = await this.getByExternalId(externalId, sn);
      if (!existing) continue;

      const q = new URLSearchParams({ sendername: sn });
      const body =
        reason?.trim() ?
          JSON.stringify({ reason: reason.trim().slice(0, 500) })
        : undefined;

      const { data, error } = await this.hubRequest<{
        id: string;
        status: string;
        ok?: boolean;
        duplicate?: boolean;
        progress?: { stage: string; message: string; executed: boolean };
      }>(
        `/v1/signals/external/${encodeURIComponent(externalId)}/invalidate?${q}`,
        {
          method: 'POST',
          ...(body ? { body } : {}),
        },
      );

      if (data) {
        return { data, error: undefined };
      }

      if (error?.includes('404')) {
        continue;
      }

      return { data: null, error: error || 'Signal Hub invalidate failed' };
    }

    return { data: null, error: undefined, notOnHub: true };
  }

  async invalidateByHubId(
    hubId: string,
    sendername: string,
    reason?: string,
  ): Promise<{
    data: {
      id: string;
      status: string;
      ok?: boolean;
      duplicate?: boolean;
      progress?: { stage: string; message: string; executed: boolean };
    } | null;
    error?: string;
  }> {
    const q = new URLSearchParams({ sendername });
    const body =
      reason?.trim() ?
        JSON.stringify({ reason: reason.trim().slice(0, 500) })
      : undefined;

    const { data, error } = await this.hubRequest<{
      id: string;
      status: string;
      ok?: boolean;
      duplicate?: boolean;
      progress?: { stage: string; message: string; executed: boolean };
    }>(`/v1/signals/${encodeURIComponent(hubId)}/invalidate?${q}`, {
      method: 'POST',
      ...(body ? { body } : {}),
    });

    return { data, error: error || undefined };
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

  async getQuote(symbol: string): Promise<SignalHubQuote | null> {
    const variants = getSymbolLookupVariants(symbol);

    for (const candidate of variants) {
      const q = new URLSearchParams({ symbol: candidate });
      let { data } = await this.hubRequest<SignalHubQuote>(`/v1/quote?${q}`);
      if (!data) {
        ({ data } = await this.hubRequest<SignalHubQuote>('/v1/quote', {
          method: 'POST',
          body: JSON.stringify({ symbol: candidate }),
        }));
      }
      if (data) {
        return {
          ...data,
          symbol: data.symbol || candidate,
          resolved_symbol: data.resolved_symbol || candidate,
        };
      }
    }

    return null;
  }

  async getQuoteMid(symbol: string): Promise<number | null> {
    const quote = await this.getQuote(symbol);
    if (!quote) return null;
    const mid = quote.mid ?? quote.price;
    return Number.isFinite(mid) ? mid : null;
  }

  async getSignalByHubId(hubId: string, sendername?: string) {
    const q = sendername
      ? new URLSearchParams({ sendername })
      : null;
    const path = q
      ? `/v1/signals/${encodeURIComponent(hubId)}?${q}`
      : `/v1/signals/${encodeURIComponent(hubId)}`;
    const { data } = await this.hubRequest<SignalHubResult>(path);
    return data;
  }

  async getSenderReport(filters?: {
    days?: number;
    sort?: string;
    min_closed_trades?: number;
    limit?: number;
  }) {
    const q = new URLSearchParams();
    if (filters?.days) q.set('days', String(filters.days));
    if (filters?.sort) q.set('sort', filters.sort);
    if (filters?.min_closed_trades !== undefined) {
      q.set('min_closed_trades', String(filters.min_closed_trades));
    }
    if (filters?.limit) q.set('limit', String(filters.limit));

    const qs = q.toString();
    const { data } = await this.hubRequest<SignalHubSenderReport>(
      `/v1/senders/report${qs ? `?${qs}` : ''}`,
    );
    return data;
  }

  async getSenderProfitability(filters?: {
    days?: number;
    min_closed_trades?: number;
    limit?: number;
  }) {
    const q = new URLSearchParams();
    if (filters?.days) q.set('days', String(filters.days));
    if (filters?.min_closed_trades !== undefined) {
      q.set('min_closed_trades', String(filters.min_closed_trades));
    }
    if (filters?.limit) q.set('limit', String(filters.limit));

    const qs = q.toString();
    const { data } = await this.hubRequest<SignalHubSenderReport>(
      `/v1/senders/profitability${qs ? `?${qs}` : ''}`,
    );
    return data;
  }

  async sendHubAction(
    sendername: string,
    input: HubActionInput,
  ): Promise<{ hub: SignalHubResult | null; error?: string }> {
    const payload: Record<string, unknown> = {
      action: input.action,
      sendername,
      provider_name: this.providerName,
    };

    if (input.external_id) payload.external_id = input.external_id;
    if (input.symbol) payload.symbol = normalizeChartSymbol(input.symbol);
    if (input.direction) payload.direction = input.direction;
    if (input.entry !== undefined) payload.entry = input.entry;
    if (input.sl !== undefined) payload.sl = input.sl;
    if (input.tp !== undefined) payload.tp = input.tp;
    if (input.lot !== undefined) payload.lot = input.lot;
    if (input.ticket !== undefined) payload.ticket = input.ticket;
    if (input.message) payload.message = input.message.slice(0, 4000);

    const { data, error } = await this.hubRequest<SignalHubResult>(
      '/v1/signals',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );

    return { hub: data, error };
  }
}
