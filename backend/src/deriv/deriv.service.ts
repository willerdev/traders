import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { resolveJwtSecret } from '../config/jwt-secret';
import {
  decryptCredential,
  encryptCredential,
} from '../common/credential-crypto.util';
import { DerivPatClient } from './deriv-pat.client';
import { DerivWsClient } from './deriv-ws.client';
import { SaveDerivCryptoWalletDto } from './deriv.dto';

const transferBuckets = new Map<string, { count: number; resetAt: number }>();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertActionRateLimit(userId: string) {
  const now = Date.now();
  const bucket = transferBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    transferBuckets.set(userId, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (bucket.count >= 8) {
    throw new ForbiddenException('Too many Deriv actions. Try again in a minute.');
  }
  bucket.count += 1;
}

function maskToken(token: string): string {
  const t = token.trim();
  if (t.length < 8) return '••••';
  return `${t.slice(0, 4)}••••${t.slice(-2)}`;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function platformName(
  login: string,
): 'mt5' | 'ctrader' | 'options' | null {
  const id = login.trim();
  if (/^MTR/i.test(id) || /^MTD/i.test(id)) return 'mt5';
  if (/^CTR/i.test(id)) return 'ctrader';
  if (/^DOT/i.test(id) || /^DOR/i.test(id) || /^ROT/i.test(id) || /^ROR/i.test(id)) {
    return 'options';
  }
  return null;
}

type WalletRow = {
  wallet_id?: string;
  type?: string;
  balances?: Record<string, { balance?: string }>;
};

type OptionsAccountRow = {
  account_id?: string;
  balance?: number;
  currency?: string;
  account_type?: string;
};

export type DerivAccountView = {
  login: string;
  kind: 'deriv' | 'mt5' | 'options';
  accountType: string | null;
  currency: string;
  balance: number;
};

@Injectable()
export class DerivService {
  private readonly logger = new Logger(DerivService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private cryptoSecret() {
    return resolveJwtSecret(this.config.get<string>('JWT_SECRET'));
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { derivApiTokenEnc: true, derivConnectedAt: true },
    });
    const connected = Boolean(user?.derivApiTokenEnc);
    return {
      connected,
      connectedAt: user?.derivConnectedAt?.toISOString() ?? null,
      tokenMasked: connected ? '••••••••' : null,
    };
  }

  async saveToken(userId: string, token: string) {
    const trimmed = token.trim();
    if (trimmed.length < 8) {
      throw new BadRequestException('That token looks too short.');
    }

    try {
      const client = await this.patClient(trimmed);
      const [wallets, options] = await this.loadAccountLists(client);
      const loginid =
        options[0]?.account_id || wallets[0]?.wallet_id || null;

      const enc = encryptCredential(trimmed, this.cryptoSecret());
      await this.prisma.user.update({
        where: { id: userId },
        data: { derivApiTokenEnc: enc, derivConnectedAt: new Date() },
      });

      this.logger.log(`Deriv PAT saved for user ${userId}`);
      return {
        connected: true,
        connectedAt: new Date().toISOString(),
        tokenMasked: maskToken(trimmed),
        loginid,
      };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ForbiddenException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Could not save Deriv token';
      this.logger.warn(`Deriv saveToken failed: ${msg}`);
      if (/derivApiTokenEnc|Unknown argument|column/i.test(msg)) {
        throw new BadRequestException(
          'Database is missing Deriv columns. Redeploy solo-api so prisma db push runs.',
        );
      }
      throw new BadRequestException(msg);
    }
  }

  async disconnect(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { derivApiTokenEnc: null, derivConnectedAt: null },
    });
    return { connected: false };
  }

  private mapCryptoWallet(row: {
    id: string;
    purpose: string;
    network: string;
    address: string;
    label: string | null;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      purpose: row.purpose,
      network: row.network,
      address: row.address,
      label: row.label,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async cryptoWallets(userId: string) {
    try {
      const rows = await this.prisma.derivCryptoWallet.findMany({
        where: { userId },
      });
      const deposit = rows.find((r) => r.purpose === 'DEPOSIT') ?? null;
      const withdraw = rows.find((r) => r.purpose === 'WITHDRAW') ?? null;
      return {
        deposit: deposit ? this.mapCryptoWallet(deposit) : null,
        withdraw: withdraw ? this.mapCryptoWallet(withdraw) : null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/derivCryptoWallet|deriv_crypto_wallets|Unknown arg/i.test(msg)) {
        return { deposit: null, withdraw: null };
      }
      throw err;
    }
  }

  async saveCryptoWallet(userId: string, dto: SaveDerivCryptoWalletDto) {
    const purpose = dto.purpose;
    const network = dto.network.trim().toUpperCase();
    const address = dto.address.trim();
    const label = dto.label?.trim() || null;
    if (address.length < 8) {
      throw new BadRequestException('That wallet address looks too short.');
    }
    try {
      const row = await this.prisma.derivCryptoWallet.upsert({
        where: { userId_purpose: { userId, purpose } },
        create: { userId, purpose, network, address, label },
        update: { network, address, label },
      });
      const all = await this.cryptoWallets(userId);
      return { ...all, saved: this.mapCryptoWallet(row) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save address';
      if (/derivCryptoWallet|deriv_crypto_wallets|Unknown arg/i.test(msg)) {
        throw new BadRequestException(
          'Database is missing Deriv wallet columns. Redeploy solo-api so prisma db push runs.',
        );
      }
      throw new BadRequestException(msg);
    }
  }

  async deleteCryptoWallet(userId: string, purposeRaw: string) {
    const purpose = purposeRaw.trim().toUpperCase();
    if (purpose !== 'DEPOSIT' && purpose !== 'WITHDRAW') {
      throw new BadRequestException('Purpose must be DEPOSIT or WITHDRAW.');
    }
    await this.prisma.derivCryptoWallet.deleteMany({
      where: { userId, purpose },
    });
    return this.cryptoWallets(userId);
  }

  async accounts(userId: string) {
    return this.withUserToken(userId, async (client) => {
      const [wallets, options] = await this.loadAccountLists(client);
      const walletViews = this.mapWallets(wallets);
      const optionViews = this.mapOptions(options);
      return {
        wallet: walletViews[0] ?? optionViews[0] ?? null,
        wallets: walletViews,
        options: optionViews,
        mt5: [] as DerivAccountView[],
      };
    });
  }

  async trades(userId: string) {
    return this.withUserToken(userId, async (client) => {
      const options = await this.listOptions(client);
      const accountId = this.pickOptionsAccount(options);
      if (!accountId) {
        const statement = await this.legacyStatement(client);
        return { open: [], statement };
      }
      return this.withOptionsSocket(client, accountId, async (ws) => {
        const [portfolioRes, statementRes] = await Promise.all([
          ws.request<{
            portfolio?: { contracts?: Array<Record<string, unknown>> };
          }>({ portfolio: 1 }),
          ws.request<{
            statement?: { transactions?: Array<Record<string, unknown>> };
          }>({ statement: 1, limit: 25, offset: 0 }),
        ]);
        return {
          open: portfolioRes.portfolio?.contracts ?? [],
          statement: statementRes.statement?.transactions ?? [],
        };
      });
    });
  }

  async transfer(
    userId: string,
    input: {
      accountFrom: string;
      accountTo: string;
      amount: number;
      currency: string;
    },
  ) {
    assertActionRateLimit(userId);
    if (input.accountFrom === input.accountTo) {
      throw new BadRequestException('Pick two different accounts.');
    }
    const amount = String(input.amount);
    const currency = input.currency.toUpperCase();
    const from = input.accountFrom.trim();
    const to = input.accountTo.trim();

    return this.withUserToken(userId, async (client) => {
      if (isUuid(from) && isUuid(to)) {
        return client.post('/wallet/v1/transfers', {
          currency,
          amount,
          source_wallet_id: from,
          destination_wallet_id: to,
          request_id: randomUUID(),
          description: 'soloEmma transfer',
        });
      }

      const fromPlatform = platformName(from);
      const toPlatform = platformName(to);
      if (isUuid(from) && toPlatform) {
        return client.post('/wallet/v1/transfers/platforms', {
          wallet_id: from,
          amount,
          currency,
          direction: 'from_wallet',
          platform_name: toPlatform,
          platform_account_id: to,
          request_id: randomUUID(),
          description: 'soloEmma transfer',
        });
      }
      if (isUuid(to) && fromPlatform) {
        return client.post('/wallet/v1/transfers/platforms', {
          wallet_id: to,
          amount,
          currency,
          direction: 'to_wallet',
          platform_name: fromPlatform,
          platform_account_id: from,
          request_id: randomUUID(),
          description: 'soloEmma transfer',
        });
      }

      throw new BadRequestException(
        'PAT transfers are wallet↔wallet or wallet↔platform (Options DOT… or MT5 MTR…). Transfer via a wallet.',
      );
    });
  }

  async sellContract(userId: string, contractId: string) {
    assertActionRateLimit(userId);
    const id = Number(contractId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Invalid contract id.');
    }
    return this.withUserToken(userId, async (client) => {
      const options = await this.listOptions(client);
      const accountId = this.pickOptionsAccount(options);
      if (!accountId) {
        throw new BadRequestException(
          'No Options account on this PAT. Close is only for Deriv Options contracts.',
        );
      }
      return this.withOptionsSocket(client, accountId, async (ws) => {
        const res = await ws.request<{ sell?: Record<string, unknown> }>({
          sell: id,
          price: 0,
        });
        return res.sell ?? { ok: true };
      });
    });
  }

  private mapWallets(wallets: WalletRow[]): DerivAccountView[] {
    const out: DerivAccountView[] = [];
    for (const row of wallets) {
      const login = String(row.wallet_id ?? '');
      if (!login) continue;
      const balances = row.balances ?? {};
      const currencies = Object.keys(balances);
      const currency =
        (currencies.includes('USD') ? 'USD' : currencies[0]) || 'USD';
      out.push({
        login,
        kind: 'deriv',
        accountType: row.type ?? 'wallet',
        currency,
        balance: Number(balances[currency]?.balance ?? 0),
      });
    }
    return out;
  }

  private mapOptions(options: OptionsAccountRow[]): DerivAccountView[] {
    return options
      .filter((row) => row.account_id)
      .map((row) => ({
        login: String(row.account_id),
        kind: 'options' as const,
        accountType: row.account_type ?? 'options',
        currency: row.currency ?? 'USD',
        balance: Number(row.balance ?? 0),
      }));
  }

  private pickOptionsAccount(options: OptionsAccountRow[]): string | null {
    const real = options.find(
      (row) => row.account_type === 'real' && row.account_id,
    );
    const any = options.find((row) => row.account_id);
    return real?.account_id || any?.account_id || null;
  }

  private async loadAccountLists(client: DerivPatClient) {
    let wallets: WalletRow[] = [];
    let options: OptionsAccountRow[] = [];
    let lastErr: unknown;
    try {
      wallets = await this.listWallets(client);
    } catch (err) {
      lastErr = err;
      this.logger.warn(
        `Deriv wallets: ${err instanceof Error ? err.message : err}`,
      );
    }
    try {
      options = await this.listOptions(client);
    } catch (err) {
      lastErr = err;
      this.logger.warn(
        `Deriv options accounts: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (wallets.length === 0 && options.length === 0) {
      if (
        lastErr instanceof BadRequestException ||
        lastErr instanceof ForbiddenException
      ) {
        throw lastErr;
      }
      throw new BadRequestException(
        'PAT connected, but Deriv returned no wallets or Options accounts. Add Trade and Payments on the token.',
      );
    }
    return [wallets, options] as const;
  }

  private async listWallets(client: DerivPatClient): Promise<WalletRow[]> {
    const res = await client.get<{ data?: WalletRow[] }>(
      '/wallet/v1/wallets?conversion_currency=USD',
    );
    return Array.isArray(res.data) ? res.data : [];
  }

  private async listOptions(
    client: DerivPatClient,
  ): Promise<OptionsAccountRow[]> {
    const res = await client.get<{ data?: OptionsAccountRow[] }>(
      '/trading/v1/options/accounts',
    );
    return Array.isArray(res.data) ? res.data : [];
  }

  private async legacyStatement(
    client: DerivPatClient,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const res = await client.get<{
        loginids?: Record<string, unknown>;
      }>('/trading/v1/options/legacy/accounts');
      const loginid = Object.keys(res.loginids ?? {})[0];
      if (!loginid) return [];
      const stmt = await client.get<{
        data?: Array<Record<string, unknown>>;
        transactions?: Array<Record<string, unknown>>;
      }>(
        `/trading/v1/options/legacy/statement?loginid=${encodeURIComponent(loginid)}&limit=25&offset=0`,
      );
      if (Array.isArray(stmt.data)) return stmt.data;
      if (Array.isArray(stmt.transactions)) return stmt.transactions;
      return [];
    } catch {
      return [];
    }
  }

  private async withOptionsSocket<T>(
    client: DerivPatClient,
    accountId: string,
    fn: (ws: DerivWsClient) => Promise<T>,
  ): Promise<T> {
    const otp = await client.post<{ data?: { url?: string } }>(
      `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    );
    const url = otp.data?.url;
    if (!url) {
      throw new BadRequestException('Deriv did not return a WebSocket URL.');
    }
    const ws = await DerivWsClient.connect(url);
    try {
      return await fn(ws);
    } finally {
      ws.close();
    }
  }

  private async withUserToken<T>(
    userId: string,
    fn: (client: DerivPatClient) => Promise<T>,
  ): Promise<T> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { derivApiTokenEnc: true },
    });
    if (!user?.derivApiTokenEnc) {
      throw new NotFoundException(
        'Connect a Deriv API token in Settings first.',
      );
    }
    let token: string;
    try {
      token = decryptCredential(user.derivApiTokenEnc, this.cryptoSecret());
    } catch {
      throw new BadRequestException(
        'Saved token could not be decrypted. Save it again in Settings.',
      );
    }
    return fn(await this.patClient(token));
  }

  private async patClient(token: string): Promise<DerivPatClient> {
    const { appId, baseUrl } = await this.connectionSettings();
    return new DerivPatClient(baseUrl, appId, token);
  }

  private async connectionSettings() {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'default' },
      select: { derivAppId: true, derivEndpoint: true },
    });
    const rawAppId =
      config?.derivAppId?.trim() ||
      this.config.get<string>('DERIV_APP_ID')?.trim() ||
      '';
    const appId = rawAppId.replace(/^["']|["']$/g, '');
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(appId) || appId.includes('.')) {
      throw new BadRequestException(
        'Set DERIV_APP_ID on solo-api to the PAT App ID from developers.deriv.com → Apps (the solo PAT app id, not an API token).',
      );
    }
    const endpoint =
      this.config.get<string>('DERIV_API_BASE')?.trim() ||
      'https://api.derivws.com';
    const baseUrl = endpoint.replace(/\/$/, '').replace(/^wss:/, 'https:');
    return { appId, baseUrl };
  }
}
