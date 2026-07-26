import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TwilioMessage = {
  sid?: string;
  status?: string;
  to?: string;
  from?: string;
  body?: string;
  error_code?: number | null;
  error_message?: string | null;
  date_created?: string;
  price?: string | null;
  price_unit?: string | null;
};

type TwilioIncomingNumber = {
  sid?: string;
  phone_number?: string;
  friendly_name?: string;
  capabilities?: { sms?: boolean; mms?: boolean; voice?: boolean };
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {}

  private accountSid() {
    return (this.config.get<string>('TWILIO_ACCOUNT_SID') || '').trim();
  }

  private apiKeySid() {
    return (this.config.get<string>('TWILIO_API_KEY_SID') || '').trim();
  }

  private apiKeySecret() {
    return (this.config.get<string>('TWILIO_API_KEY_SECRET') || '').trim();
  }

  private authToken() {
    return (this.config.get<string>('TWILIO_AUTH_TOKEN') || '').trim();
  }

  private fromNumber() {
    return (this.config.get<string>('TWILIO_FROM_NUMBER') || '').trim();
  }

  private whatsappFrom() {
    return (
      (this.config.get<string>('TWILIO_WHATSAPP_FROM') || '').trim() ||
      this.fromNumber()
    );
  }

  private contentSid() {
    return (this.config.get<string>('TWILIO_CONTENT_SID') || '').trim();
  }

  private testTo() {
    return (this.config.get<string>('TWILIO_TEST_TO') || '').trim();
  }

  get isConfigured() {
    const hasApiKey = Boolean(this.apiKeySid() && this.apiKeySecret());
    const hasAuthToken = Boolean(this.authToken());
    return Boolean(this.accountSid() && (hasApiKey || hasAuthToken));
  }

  getStatus() {
    const from = this.fromNumber();
    const waFrom = this.whatsappFrom();
    return {
      configured: this.isConfigured,
      accountSidMasked: this.maskSid(this.accountSid()),
      apiKeySidMasked: this.maskSid(this.apiKeySid()),
      hasAuthToken: Boolean(this.authToken()),
      fromNumber: from || null,
      whatsappFrom: waFrom || null,
      contentSid: this.contentSid() || null,
      testTo: this.testTo() || null,
      hasFromNumber: Boolean(from || waFrom),
      note: !this.isConfigured
        ? 'Set TWILIO_ACCOUNT_SID plus API key or TWILIO_AUTH_TOKEN in backend/.env'
        : !(from || waFrom)
          ? 'Set TWILIO_FROM_NUMBER / TWILIO_WHATSAPP_FROM'
          : 'Ready to send test SMS / WhatsApp',
    };
  }

  async listIncomingNumbers() {
    this.requireConfigured();
    const data = await this.twilioGet<{
      incoming_phone_numbers?: TwilioIncomingNumber[];
    }>('IncomingPhoneNumbers.json?PageSize=50');

    const items = (data.incoming_phone_numbers ?? []).map((n) => ({
      sid: n.sid ?? '',
      phoneNumber: n.phone_number ?? '',
      friendlyName: n.friendly_name ?? '',
      sms: Boolean(n.capabilities?.sms),
    }));

    const waFrom = this.whatsappFrom();
    if (waFrom) {
      items.unshift({
        sid: 'whatsapp-sandbox',
        phoneNumber: waFrom,
        friendlyName: 'WhatsApp sender (env)',
        sms: true,
      });
    }

    return {
      items,
      defaultFrom: waFrom || this.fromNumber() || null,
      count: items.length,
    };
  }

  async sendTestSms(input: {
    to: string;
    body?: string;
    from?: string;
    channel?: 'sms' | 'whatsapp';
    contentSid?: string;
    contentVariables?: Record<string, string>;
  }) {
    this.requireConfigured();

    const channel =
      input.channel ||
      (this.looksLikeWhatsApp(input.to) || this.looksLikeWhatsApp(input.from)
        ? 'whatsapp'
        : 'sms');

    const to = this.normalizeAddress(input.to, channel);
    const fromRaw =
      input.from?.trim() ||
      (channel === 'whatsapp' ? this.whatsappFrom() : this.fromNumber());
    const from = this.normalizeAddress(fromRaw, channel);
    if (!from) {
      throw new BadRequestException(
        channel === 'whatsapp'
          ? 'No WhatsApp from — set TWILIO_WHATSAPP_FROM'
          : 'No from number — set TWILIO_FROM_NUMBER or pass from',
      );
    }

    const form = new URLSearchParams({ To: to, From: from });

    if (channel === 'whatsapp') {
      const contentSid = (input.contentSid || this.contentSid()).trim();
      if (contentSid) {
        form.set('ContentSid', contentSid);
        const vars = input.contentVariables ?? { '1': input.body?.trim() || 'test' };
        form.set('ContentVariables', JSON.stringify(vars));
      } else {
        const body =
          input.body?.trim() ||
          `TraderRank Pro WhatsApp test · ${new Date().toISOString()}`;
        form.set('Body', body);
      }
    } else {
      const body =
        input.body?.trim() ||
        `TraderRank Pro SMS test · ${new Date().toISOString()}`;
      if (body.length > 1600) {
        throw new BadRequestException('Message body is too long (max 1600 chars)');
      }
      form.set('Body', body);
    }

    try {
      const message = await this.twilioPostForm<TwilioMessage>(
        'Messages.json',
        form,
      );
      this.logger.log(
        `Test ${channel} ${message.sid} → ${to} status=${message.status}`,
      );
      return {
        ok: true,
        channel,
        sid: message.sid ?? null,
        status: message.status ?? null,
        to: message.to ?? to,
        from: message.from ?? from,
        body: message.body ?? input.body ?? null,
        errorCode: message.error_code ?? null,
        errorMessage: message.error_message ?? null,
        message: `${channel.toUpperCase()} queued (${message.status ?? 'unknown'}) to ${to}`,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Test ${channel} failed: ${detail}`);
      throw new BadRequestException(detail);
    }
  }

  private requireConfigured() {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Twilio is not configured — add TWILIO_ACCOUNT_SID plus API key or TWILIO_AUTH_TOKEN to backend/.env',
      );
    }
  }

  private looksLikeWhatsApp(raw?: string) {
    return Boolean(raw && /^whatsapp:/i.test(raw.trim()));
  }

  private normalizeAddress(raw: string, channel: 'sms' | 'whatsapp') {
    let value = (raw || '').trim().replace(/[\s()-]/g, '');
    if (!value) {
      throw new BadRequestException('Phone number is required');
    }

    const isWa = channel === 'whatsapp' || /^whatsapp:/i.test(value);
    if (isWa) {
      value = value.replace(/^whatsapp:/i, '');
      const e164 = value.startsWith('+') ? value : `+${value}`;
      if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
        throw new BadRequestException(
          'WhatsApp number must be E.164, e.g. whatsapp:+2567xxxxxxx',
        );
      }
      return `whatsapp:${e164}`;
    }

    const withPlus = value.startsWith('+') ? value : `+${value}`;
    if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) {
      throw new BadRequestException(
        'Use E.164 format, e.g. +12025550123 or +2567xxxxxxx',
      );
    }
    return withPlus;
  }

  private maskSid(sid: string) {
    if (!sid) return null;
    if (sid.length <= 8) return `${sid.slice(0, 2)}…`;
    return `${sid.slice(0, 4)}…${sid.slice(-4)}`;
  }

  private authHeader() {
    const user = this.apiKeySid() || this.accountSid();
    const pass = this.apiKeySecret() || this.authToken();
    const token = Buffer.from(`${user}:${pass}`).toString('base64');
    return `Basic ${token}`;
  }

  private baseUrl() {
    return `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid()}`;
  }

  private async twilioGet<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl()}/${path}`, {
      headers: { Authorization: this.authHeader() },
    });
    return this.parseTwilioResponse<T>(res);
  }

  private async twilioPostForm<T>(
    path: string,
    form: URLSearchParams,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl()}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    return this.parseTwilioResponse<T>(res);
  }

  private async parseTwilioResponse<T>(res: Response): Promise<T> {
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { message: text };
    }

    if (!res.ok) {
      const message =
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error_message === 'string' && data.error_message) ||
        text.slice(0, 300) ||
        `Twilio HTTP ${res.status}`;
      const code = data.code != null ? ` [${data.code}]` : '';
      throw new Error(`${message}${code}`);
    }

    return data as T;
  }
}
