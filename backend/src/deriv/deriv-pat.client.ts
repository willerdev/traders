import { BadRequestException } from '@nestjs/common';

export type DerivPatJson = Record<string, unknown>;

export class DerivPatClient {
  constructor(
    private readonly baseUrl: string,
    private readonly appId: string,
    private readonly token: string,
  ) {}

  async get<T = DerivPatJson>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = DerivPatJson>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Deriv-App-ID': this.appId,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'network error';
      throw new BadRequestException(`Could not reach Deriv (${msg}).`);
    }

    const raw = await res.text();
    let parsed: DerivPatJson = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as DerivPatJson;
      } catch {
        parsed = { message: raw.slice(0, 240) };
      }
    }

    if (!res.ok) {
      throw new BadRequestException(formatDerivHttpError(res.status, parsed, this.appId));
    }
    return parsed as T;
  }
}

function formatDerivHttpError(
  status: number,
  body: DerivPatJson,
  appId: string,
): string {
  const errors = body.errors;
  const first =
    Array.isArray(errors) && errors[0] && typeof errors[0] === 'object'
      ? (errors[0] as { message?: string; code?: string })
      : null;
  const message =
    first?.message ||
    (typeof body.message === 'string' ? body.message : '') ||
    `Deriv HTTP ${status}`;

  if (status === 401) {
    return `Deriv rejected the PAT App ID (${appId}) or token. On Render solo-api set DERIV_APP_ID to the PAT App ID from developers.deriv.com → Apps (the solo PAT app, not a token). Create the token there with Trade, Account management, and Payments.`;
  }
  if (status === 403) {
    return `${message} Recreate the PAT with Trade, Payments, and Account management.`;
  }
  return message;
}
