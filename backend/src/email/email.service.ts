import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  readonly from: string;
  readonly frontendUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = (this.config.get<string>('RESEND_API_KEY') || '').trim();
    this.from =
      this.config.get<string>('EMAIL_FROM')?.trim() ||
      'TraderRank Pro <notifications@thetradeguard.com>';
    this.frontendUrl =
      (this.config.get<string>('FRONTEND_URL') || 'https://thetradeguard.com')
        .split(',')[0]
        .trim() || 'https://thetradeguard.com';
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  layout(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0b0f14;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e8eaed;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f14;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111827;border:1px solid #1e2936;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px 8px;border-bottom:1px solid #1e2936;">
              <p style="margin:0;font-size:13px;color:#5b9cf5;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">TraderRank Pro</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">${title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;font-size:15px;line-height:1.6;color:#cbd5e1;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #1e2936;font-size:12px;color:#64748b;">
              <a href="${this.frontendUrl}" style="color:#5b9cf5;text-decoration:none;">thetradeguard.com</a>
              · Trader talent discovery &amp; funding
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  button(href: string, label: string): string {
    return `<p style="margin:24px 0 0;">
      <a href="${href}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a>
    </p>`;
  }

  async send(params: SendEmailParams): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('RESEND_API_KEY not set — email skipped');
      return false;
    }

    const to = params.to.trim();
    if (!to || !to.includes('@')) {
      this.logger.warn(`Invalid email recipient: ${to}`);
      return false;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject: params.subject,
          html: params.html,
          ...(params.text ? { text: params.text } : {}),
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        this.logger.error(
          `Resend ${res.status}: ${JSON.stringify(body).slice(0, 300)}`,
        );
        return false;
      }

      this.logger.log(`Email sent to ${to}: ${params.subject}`);
      return true;
    } catch (err) {
      this.logger.error(
        `Email send failed: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}
