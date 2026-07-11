import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Mt5LinkRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetaApiAccount, MetaApiService } from '../metaapi/metaapi.service';
import { humanizeBrokerError } from '../common/broker-error.util';
import {
  decryptCredential,
  encryptCredential,
} from '../common/credential-crypto.util';
import { resolveJwtSecret } from '../config/jwt-secret';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from '../email/notification.service';

export type LinkableMt5Account = MetaApiAccount & {
  assignedToYou: boolean;
  available: boolean;
};

export type LinkMt5AccountInput = {
  accountName: string;
  login: string;
  password: string;
  server: string;
};

@Injectable()
export class Mt5PoolService {
  private readonly logger = new Logger(Mt5PoolService.name);
  private readonly credentialSecret: string;

  constructor(
    private prisma: PrismaService,
    private metaApi: MetaApiService,
    private config: ConfigService,
    private notifications: NotificationService,
  ) {
    this.credentialSecret = resolveJwtSecret(
      this.config.get<string>('JWT_SECRET'),
    );
  }

  private reservedAccountIds(): Set<string> {
    const ids = [
      this.metaApi.getConfiguredDefaultAccountId(),
      this.metaApi.getConfiguredCopyAccountId(),
    ].filter((id): id is string => Boolean(id?.trim()));
    return new Set(ids);
  }

  private async loadPoolAccounts(): Promise<MetaApiAccount[]> {
    if (!this.metaApi.isConfigured) return [];

    let result = await this.metaApi.listAccounts({
      limit: 100,
      deploymentStatus: 'deployed',
    });
    if (result.items.length === 0) {
      result = await this.metaApi.listAccounts({ limit: 100 });
    }
    return result.items;
  }

  private async assignedAccountMap(excludeUserId?: string) {
    const rows = await this.prisma.user.findMany({
      where: { metaApiAccountId: { not: null } },
      select: { id: true, metaApiAccountId: true },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = row.metaApiAccountId?.trim();
      if (!id) continue;
      if (excludeUserId && row.id === excludeUserId) continue;
      map.set(id, row.id);
    }
    return map;
  }

  async listLinkableAccounts(userId: string) {
    if (!this.metaApi.isConfigured) {
      return { configured: false, count: 0, items: [] as LinkableMt5Account[] };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metaApiAccountId: true },
    });
    const reserved = this.reservedAccountIds();
    const assigned = await this.assignedAccountMap(userId);
    const accounts = await this.loadPoolAccounts();

    const items: LinkableMt5Account[] = accounts
      .filter((account) => !reserved.has(account.id))
      .map((account) => {
        const assignedToOther = assigned.has(account.id);
        const assignedToYou = user?.metaApiAccountId === account.id;
        return {
          ...account,
          assignedToYou,
          available: assignedToYou || !assignedToOther,
        };
      })
      .filter((account) => account.available)
      .sort((a, b) => {
        const rank = (account: MetaApiAccount) =>
          account.connectionStatus === 'CONNECTED'
            ? 0
            : account.connectionStatus === 'DISCONNECTED'
              ? 2
              : 1;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });

    return { configured: true, count: items.length, items };
  }

  private isStaleMetaApiAccountError(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      /validation failed/i.test(msg) ||
      /not found/i.test(msg) ||
      /does not exist/i.test(msg) ||
      /account lookup failed \(404\)/i.test(msg)
    );
  }

  private normalizeLogin(login: string): string {
    const digits = login.replace(/\D/g, '');
    if (!digits) {
      throw new BadRequestException('MT5 login must contain digits');
    }
    return digits;
  }

  private validateLinkInput(input: LinkMt5AccountInput) {
    const accountName = input.accountName.trim();
    const server = input.server.trim();
    const password = input.password;
    const login = this.normalizeLogin(input.login);

    if (!accountName) {
      throw new BadRequestException('Account name is required');
    }
    if (!server) {
      throw new BadRequestException('MT5 server name is required');
    }
    if (!password) {
      throw new BadRequestException('MT5 password is required');
    }

    return { accountName, server, password, login };
  }

  private async findExistingMetaApiAccount(login: string, server: string) {
    const accounts = await this.loadPoolAccounts();
    return accounts.find(
      (row) =>
        row.login.replace(/\D/g, '') === login &&
        row.server.trim().toLowerCase() === server.trim().toLowerCase(),
    );
  }

  private async saveFailedLinkRequest(input: {
    userId: string;
    accountName: string;
    login: string;
    server: string;
    password: string;
    errorMessage: string;
  }) {
    const passwordEncrypted = encryptCredential(
      input.password,
      this.credentialSecret,
    );

    await this.prisma.mt5LinkRequest.updateMany({
      where: {
        userId: input.userId,
        status: Mt5LinkRequestStatus.PENDING,
      },
      data: {
        status: Mt5LinkRequestStatus.FAILED,
        errorMessage: 'Superseded by a newer link attempt',
      },
    });

    return this.prisma.mt5LinkRequest.create({
      data: {
        userId: input.userId,
        accountName: input.accountName,
        login: input.login,
        server: input.server,
        passwordEncrypted,
        status: Mt5LinkRequestStatus.FAILED,
        errorMessage: input.errorMessage.slice(0, 2000),
      },
    });
  }

  private async notifyAdminLinkFailed(input: {
    userDisplayName: string;
    userEmail: string | null;
    accountName: string;
    login: string;
    server: string;
    password: string;
    errorMessage: string;
  }) {
    await this.notifications.mt5LinkFailedAdmin({
      userDisplayName: input.userDisplayName,
      userEmail: input.userEmail,
      accountName: input.accountName,
      login: input.login,
      server: input.server,
      password: input.password,
      errorMessage: input.errorMessage,
    });
  }

  async linkUserAccount(userId: string, rawInput: LinkMt5AccountInput) {
    if (!this.metaApi.isConfigured) {
      throw new ServiceUnavailableException(
        'Live MT5 linking is not configured on the platform yet',
      );
    }

    const input = this.validateLinkInput(rawInput);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        metaApiAccountId: true,
        displayName: true,
        email: true,
      },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.metaApiAccountId?.trim()) {
      const linkedId = user.metaApiAccountId.trim();
      try {
        const existing = await this.metaApi.getAccount(linkedId);
        return {
          alreadyLinked: true,
          accountId: existing.id,
          account: existing,
        };
      } catch (err) {
        if (!this.isStaleMetaApiAccountError(err)) {
          throw new BadRequestException(
            humanizeBrokerError(
              err instanceof Error ? err.message : String(err),
              'Could not verify your linked MT5 account. Please try again shortly.',
            ),
          );
        }
        this.logger.warn(
          `Clearing stale MT5 link ${linkedId} for user ${userId}`,
        );
        await this.prisma.user.update({
          where: { id: userId },
          data: { metaApiAccountId: null },
        });
      }
    }

    const existingAccount = await this.findExistingMetaApiAccount(
      input.login,
      input.server,
    );
    if (existingAccount) {
      await this.assertAccountLinkable(userId, existingAccount.id);
      await this.prisma.user.update({
        where: { id: userId },
        data: { metaApiAccountId: existingAccount.id },
      });
      this.logger.log(
        `Linked existing MetaAPI account ${existingAccount.id} to ${user.displayName}`,
      );
      return {
        alreadyLinked: false,
        accountId: existingAccount.id,
        account: existingAccount,
      };
    }

    try {
      const created = await this.metaApi.createMt5Account({
        login: input.login,
        password: input.password,
        name: input.accountName,
        server: input.server,
      });

      await this.assertAccountLinkable(userId, created.id);

      if (created.state === 'UNDEPLOYED') {
        await this.metaApi.ensureAccountReady(created.id);
      }

      const account = await this.metaApi.getAccount(created.id);
      await this.prisma.user.update({
        where: { id: userId },
        data: { metaApiAccountId: created.id },
      });

      await this.prisma.mt5LinkRequest.create({
        data: {
          userId,
          accountName: input.accountName,
          login: input.login,
          server: input.server,
          passwordEncrypted: encryptCredential(
            input.password,
            this.credentialSecret,
          ),
          status: Mt5LinkRequestStatus.LINKED,
          metaApiAccountId: created.id,
        },
      });

      this.logger.log(
        `Provisioned MT5 account ${created.id} (${input.login}@${input.server}) for ${user.displayName}`,
      );

      return {
        alreadyLinked: false,
        accountId: created.id,
        account,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `MT5 link failed for ${user.displayName}: ${errorMessage}`,
      );

      await this.saveFailedLinkRequest({
        userId,
        accountName: input.accountName,
        login: input.login,
        server: input.server,
        password: input.password,
        errorMessage,
      });

      await this.notifyAdminLinkFailed({
        userDisplayName: user.displayName,
        userEmail: user.email,
        accountName: input.accountName,
        login: input.login,
        server: input.server,
        password: input.password,
        errorMessage,
      });

      throw new BadRequestException(
        'We could not connect your MT5 account automatically. Your details have been saved and our team has been notified — we will link your account shortly.',
      );
    }
  }

  /** @deprecated Use linkUserAccount — kept as alias for existing call sites. */
  async claimAccount(userId: string, input: LinkMt5AccountInput) {
    return this.linkUserAccount(userId, input);
  }

  async assignFirstAvailableAccount(userId: string) {
    const pool = await this.listLinkableAccounts(userId);
    const candidate = pool.items.find(
      (row) => row.available && !row.assignedToYou,
    );
    if (!candidate) {
      this.logger.warn(`No pool MT5 account available for user ${userId}`);
      return null;
    }

    await this.assertAccountLinkable(userId, candidate.id);
    await this.prisma.user.update({
      where: { id: userId },
      data: { metaApiAccountId: candidate.id },
    });

    this.logger.log(
      `Assigned pool MetaAPI account ${candidate.id} to user ${userId}`,
    );

    return { accountId: candidate.id, account: candidate };
  }

  async assertAccountLinkable(userId: string, accountId: string) {
    const reserved = this.reservedAccountIds();
    if (reserved.has(accountId)) {
      throw new BadRequestException(
        'That account is reserved for platform trading and cannot be linked personally',
      );
    }

    const assigned = await this.assignedAccountMap(userId);
    const owner = assigned.get(accountId);
    if (owner && owner !== userId) {
      throw new BadRequestException(
        'That MT5 account is already linked to another trader',
      );
    }
  }

  async listFailedLinkRequests() {
    const rows = await this.prisma.mt5LinkRequest.findMany({
      where: { status: Mt5LinkRequestStatus.FAILED },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { displayName: true, email: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userDisplayName: row.user.displayName,
      userEmail: row.user.email,
      accountName: row.accountName,
      login: row.login,
      server: row.server,
      password: decryptCredential(row.passwordEncrypted, this.credentialSecret),
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
